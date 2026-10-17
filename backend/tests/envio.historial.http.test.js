// Historial de estados de envío (RF-028, RF-029; docs/diseno/info-envio.md §5).
//
// Cada cambio de InfoEnvio.estadoEnvio deja UNA fila en HistorialEstadoEnvio
// con estado anterior (NULL en el alta), estado nuevo, el usuario que lo hizo y
// fecha/hora, escrita en la MISMA transacción y bajo el mismo lock del pedido.
//
// Sitios que escriben el envío (los tres que existen):
//   - alta del InfoEnvio en POST /api/v1/pedidos (usuario: el cliente);
//   - PUT   /api/v1/pedidos/:id/estado-envio (admin / vendedor);
//   - PATCH /api/v1/pedidos/:id/estado cuando el estado nuevo es de envío.
// Cancelar, cancelar vencidos y el webhook de pagos NO tocan InfoEnvio: no
// escriben historial (por eso usuarioId es NOT NULL: ningún cambio lo dispara
// el sistema sin usuario).
//
// Se verifica por HTTP y consultando las filas con prisma. El esquema (FKs,
// índice, migración) está en envio.historial.esquema.test.js.
const { describe, it, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const SECRETO_WEBHOOK = "secreto-webhook-solo-tests";
process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-token-falso-solo-tests";
process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRETO_WEBHOOK;

const mercadopago = require("mercadopago");
const {
  prisma,
  iniciarServidor,
  pedir,
  crearUsuario,
  crearVariante,
  crearZona,
  crearDireccion,
  crearPedido,
  agregarAlCarrito,
  limpiar,
} = require("./helpers/entorno");
const { generarToken } = require("../src/utils/jwt");

const HORA_MS = 60 * 60 * 1000;
const ID_INEXISTENTE = 2147483000;

function assertErrorEstandar(respuesta, status, codigo) {
  assert.equal(respuesta.status, status, JSON.stringify(respuesta.body));
  assert.deepEqual(Object.keys(respuesta.body.error).sort(), ["codigo", "detalles", "mensaje"]);
  assert.equal(respuesta.body.error.codigo, codigo);
}

function firmar(dataId, requestId, ts = Math.floor(Date.now() / 1000)) {
  const manifiesto = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac("sha256", SECRETO_WEBHOOK).update(manifiesto).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

// Ejecuta `fn` silenciando console.error (el 500 esperado de la prueba de
// atomicidad loguea el error); devuelve el resultado de `fn`.
async function sinLogs(fn) {
  const mockLog = mock.method(console, "error", () => {});
  try {
    return await fn();
  } finally {
    mockLog.mock.restore();
  }
}

describe("Historial de estados de envío (RF-028, RF-029)", () => {
  let servidor;
  let api;
  let admin;
  let vendedor;
  let mockObtenerPago;

  async function clienteConDireccion() {
    const cliente = await crearUsuario("cliente");
    const zona = await crearZona({ costo: "8000.00" });
    const direccion = await crearDireccion(cliente.id, {
      ciudad: zona.ciudad,
      departamento: zona.departamento,
    });
    return { ...cliente, direccion };
  }

  // Pedido real (POST /pedidos) llevado hasta `estado` como lo haría el
  // flujo: el webhook lo deja CONFIRMADO (acá se simula directo en la base) y
  // el personal lo pasa a EN_PREPARACION por PATCH /estado.
  async function pedidoEn(estado, { cliente, metodoPago = "MERCADO_PAGO" } = {}) {
    const duenio = cliente ?? (await clienteConDireccion());
    const variante = await crearVariante({ stock: 10 });
    await agregarAlCarrito(duenio.id, variante, 1);
    const r = await api("POST", "/api/v1/pedidos", {
      token: duenio.token,
      body: { direccionId: duenio.direccion.id, metodoPago },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const pedido = r.body.pedido;

    if (estado !== "PENDIENTE") {
      await prisma.pedido.update({ where: { id: pedido.id }, data: { estado: "CONFIRMADO" } });
    }
    if (estado === "EN_PREPARACION") {
      const p = await api("PATCH", `/api/v1/pedidos/${pedido.id}/estado`, {
        token: vendedor.token,
        body: { estado: "EN_PREPARACION" },
      });
      assert.equal(p.status, 200, JSON.stringify(p.body));
    }
    return { pedido, cliente: duenio };
  }

  const avanzar = (pedidoId, estadoEnvio, usuario = admin) =>
    api("PUT", `/api/v1/pedidos/${pedidoId}/estado-envio`, {
      token: usuario.token,
      body: { estadoEnvio },
    });
  const patchEstado = (pedidoId, estado, usuario = admin) =>
    api("PATCH", `/api/v1/pedidos/${pedidoId}/estado`, { token: usuario.token, body: { estado } });
  const seguimiento = (pedidoId, usuario) =>
    api("GET", `/api/v1/pedidos/${pedidoId}/seguimiento`, { token: usuario.token });

  // Filas del historial del pedido en orden de inserción.
  const historialDe = (pedidoId) =>
    prisma.historialEstadoEnvio.findMany({
      where: { infoEnvio: { pedidoId } },
      orderBy: { id: "asc" },
    });
  // Forma abreviada para comparar: [anterior, nuevo, usuarioId].
  const resumen = (filas) => filas.map((f) => [f.estadoAnterior, f.estadoNuevo, f.usuarioId]);

  const estados = async (pedidoId) => {
    const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: { infoEnvio: true } });
    return { pedido: pedido.estado, envio: pedido.infoEnvio?.estadoEnvio ?? null };
  };

  before(async () => {
    mockObtenerPago = mock.method(mercadopago.Payment.prototype, "get", async () => {
      throw new Error("red prohibida en tests: falta mockear esta llamada al SDK");
    });
    servidor = await iniciarServidor();
    api = (metodo, ruta, opciones) => pedir(servidor.baseUrl, metodo, ruta, opciones);
    admin = await crearUsuario("admin");
    vendedor = await crearUsuario("vendedor");
  });

  beforeEach(() => {
    mockObtenerPago.mock.resetCalls();
  });

  after(async () => {
    mock.restoreAll();
    await servidor.cerrar();
    await limpiar();
  });

  describe("alta del InfoEnvio (POST /api/v1/pedidos)", () => {
    it("deja exactamente 1 fila null -> EN_PREPARACION con el cliente que creó el pedido y su fecha", async () => {
      const antes = Date.now();
      const { pedido, cliente } = await pedidoEn("PENDIENTE");

      const filas = await historialDe(pedido.id);

      assert.equal(filas.length, 1);
      assert.deepEqual(resumen(filas), [[null, "EN_PREPARACION", cliente.id]]);
      assert.ok(filas[0].creadoEn.getTime() >= antes - 1000);
      assert.ok(filas[0].creadoEn.getTime() <= Date.now() + 1000);
      const info = await prisma.infoEnvio.findUnique({ where: { pedidoId: pedido.id } });
      assert.equal(filas[0].infoEnvioId, info.id);
    });

    it("un pedido rechazado (carrito vacío) no deja InfoEnvio ni historial", async () => {
      const cliente = await clienteConDireccion();
      const antes = await prisma.historialEstadoEnvio.count({ where: { usuarioId: cliente.id } });

      const r = await api("POST", "/api/v1/pedidos", {
        token: cliente.token,
        body: { direccionId: cliente.direccion.id, metodoPago: "MERCADO_PAGO" },
      });

      assertErrorEstandar(r, 409, "CARRITO_VACIO");
      assert.equal(await prisma.historialEstadoEnvio.count({ where: { usuarioId: cliente.id } }), antes);
    });

    it("un alta rechazada por stock insuficiente no deja pedido, InfoEnvio ni historial", async () => {
      const cliente = await clienteConDireccion();
      const variante = await crearVariante({ stock: 1 });
      await agregarAlCarrito(cliente.id, variante, 3);

      const r = await api("POST", "/api/v1/pedidos", {
        token: cliente.token,
        body: { direccionId: cliente.direccion.id, metodoPago: "MERCADO_PAGO" },
      });

      assertErrorEstandar(r, 409, "STOCK_INSUFICIENTE");
      assert.equal(await prisma.pedido.count({ where: { usuarioId: cliente.id } }), 0);
      assert.equal(await prisma.historialEstadoEnvio.count({ where: { usuarioId: cliente.id } }), 0);
    });
  });

  describe("PUT /api/v1/pedidos/:id/estado-envio", () => {
    it("cada avance válido agrega anterior -> nuevo con el usuario staff que lo hizo y su fecha", async () => {
      const { pedido, cliente } = await pedidoEn("EN_PREPARACION");
      let anterior = (await historialDe(pedido.id)).at(-1).creadoEn;

      for (const [estadoEnvio, usuario] of [
        ["ENVIADO", admin],
        ["EN_TRANSITO", vendedor],
        ["ENTREGADO", admin],
      ]) {
        await new Promise((resolver) => setTimeout(resolver, 15));
        const antes = Date.now();
        const r = await avanzar(pedido.id, estadoEnvio, usuario);
        assert.equal(r.status, 200, `${estadoEnvio}: ${JSON.stringify(r.body)}`);

        const ultima = (await historialDe(pedido.id)).at(-1);
        assert.equal(ultima.estadoNuevo, estadoEnvio);
        assert.equal(ultima.usuarioId, usuario.id);
        assert.ok(ultima.creadoEn > anterior, "la fecha del cambio no avanzó");
        assert.ok(ultima.creadoEn.getTime() >= antes - 1000);
        anterior = ultima.creadoEn;
      }

      assert.deepEqual(resumen(await historialDe(pedido.id)), [
        [null, "EN_PREPARACION", cliente.id],
        ["EN_PREPARACION", "ENVIADO", admin.id],
        ["ENVIADO", "EN_TRANSITO", vendedor.id],
        ["EN_TRANSITO", "ENTREGADO", admin.id],
      ]);
      assert.deepEqual(await estados(pedido.id), { pedido: "ENTREGADO", envio: "ENTREGADO" });
    });

    it("saltos, retrocesos y repetir el estado -> 409 de hoy y NO escriben historial", async () => {
      const { pedido, cliente } = await pedidoEn("EN_PREPARACION");
      const alta = [[null, "EN_PREPARACION", cliente.id]];

      for (const estadoEnvio of ["EN_TRANSITO", "ENTREGADO", "EN_PREPARACION"]) {
        assertErrorEstandar(await avanzar(pedido.id, estadoEnvio), 409, "TRANSICION_ENVIO_INVALIDA");
      }
      assert.deepEqual(resumen(await historialDe(pedido.id)).slice(1), []);

      assert.equal((await avanzar(pedido.id, "ENVIADO")).status, 200);
      // Mismo estado (doble clic) y retroceso: error y sin fila nueva.
      for (const estadoEnvio of ["ENVIADO", "EN_PREPARACION"]) {
        assertErrorEstandar(await avanzar(pedido.id, estadoEnvio), 409, "TRANSICION_ENVIO_INVALIDA");
      }
      assert.deepEqual(resumen(await historialDe(pedido.id)), [
        ...alta,
        ["EN_PREPARACION", "ENVIADO", admin.id],
      ]);
    });

    it("body inválido, pedido inexistente, cliente (403) y pedido que no está en preparación no escriben historial", async () => {
      const { pedido, cliente } = await pedidoEn("EN_PREPARACION");
      const confirmado = await pedidoEn("CONFIRMADO");
      const filasAntes = (await historialDe(pedido.id)).length;

      assertErrorEstandar(
        await api("PUT", `/api/v1/pedidos/${pedido.id}/estado-envio`, { token: admin.token, body: {} }),
        400,
        "VALIDACION_FALLIDA"
      );
      assertErrorEstandar(await avanzar(pedido.id, "ENVIADO", cliente), 403, "ACCESO_DENEGADO");
      assertErrorEstandar(await avanzar(ID_INEXISTENTE, "ENVIADO"), 404, "PEDIDO_NO_ENCONTRADO");
      assertErrorEstandar(await avanzar(confirmado.pedido.id, "ENVIADO"), 409, "TRANSICION_ENVIO_INVALIDA");

      assert.equal((await historialDe(pedido.id)).length, filasAntes);
      assert.equal((await historialDe(confirmado.pedido.id)).length, 1); // solo el alta
    });

    it("tres avances SIMULTÁNEOS al mismo estado dejan exactamente UNA fila nueva", async () => {
      for (let ronda = 0; ronda < 3; ronda++) {
        const { pedido } = await pedidoEn("EN_PREPARACION");

        const respuestas = await Promise.all([
          avanzar(pedido.id, "ENVIADO", admin),
          avanzar(pedido.id, "ENVIADO", vendedor),
          avanzar(pedido.id, "ENVIADO", admin),
        ]);

        assert.deepEqual(respuestas.map((r) => r.status).sort(), [200, 409, 409]);
        const filas = await historialDe(pedido.id);
        assert.equal(filas.length, 2, JSON.stringify(resumen(filas)));
        assert.deepEqual(filas[1].estadoAnterior, "EN_PREPARACION");
        assert.equal(filas[1].estadoNuevo, "ENVIADO");
      }
    });
  });

  describe("PATCH /api/v1/pedidos/:id/estado (sincroniza el envío)", () => {
    it("CONFIRMADO -> EN_PREPARACION NO cambia el InfoEnvio, así que no escribe historial", async () => {
      const { pedido, cliente } = await pedidoEn("CONFIRMADO");

      const r = await patchEstado(pedido.id, "EN_PREPARACION", vendedor);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(await estados(pedido.id), { pedido: "EN_PREPARACION", envio: "EN_PREPARACION" });
      assert.deepEqual(resumen(await historialDe(pedido.id)), [[null, "EN_PREPARACION", cliente.id]]);
    });

    it("los estados de envío escriben anterior -> nuevo con el usuario staff y dejan Pedido e InfoEnvio coherentes", async () => {
      const { pedido, cliente } = await pedidoEn("EN_PREPARACION");

      for (const [estado, usuario] of [
        ["ENVIADO", vendedor],
        ["EN_TRANSITO", admin],
        ["ENTREGADO", vendedor],
      ]) {
        const antes = Date.now();
        const r = await patchEstado(pedido.id, estado, usuario);
        assert.equal(r.status, 200, `${estado}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.pedido.estado, estado);
        assert.equal(r.body.pedido.infoEnvio.estadoEnvio, estado);
        assert.deepEqual(await estados(pedido.id), { pedido: estado, envio: estado });
        assert.ok((await historialDe(pedido.id)).at(-1).creadoEn.getTime() >= antes - 1000);
      }

      assert.deepEqual(resumen(await historialDe(pedido.id)), [
        [null, "EN_PREPARACION", cliente.id],
        ["EN_PREPARACION", "ENVIADO", vendedor.id],
        ["ENVIADO", "EN_TRANSITO", admin.id],
        ["EN_TRANSITO", "ENTREGADO", vendedor.id],
      ]);
    });

    it("las transiciones rechazadas (salto, CANCELADO a mano, Mercado Pago sin pago aprobado) no escriben historial", async () => {
      const pendiente = await pedidoEn("PENDIENTE");
      const confirmado = await pedidoEn("CONFIRMADO");

      // Saltos y estados que no se fijan a mano: 409 sin cambios ni filas nuevas.
      assertErrorEstandar(await patchEstado(confirmado.pedido.id, "ENVIADO"), 409, "TRANSICION_ESTADO_INVALIDA");
      assertErrorEstandar(await patchEstado(confirmado.pedido.id, "CANCELADO"), 409, "TRANSICION_ESTADO_INVALIDA");
      assertErrorEstandar(await patchEstado(pendiente.pedido.id, "CONFIRMADO"), 409, "TRANSICION_ESTADO_INVALIDA");

      assert.deepEqual(await estados(confirmado.pedido.id), { pedido: "CONFIRMADO", envio: "EN_PREPARACION" });
      assert.deepEqual(await estados(pendiente.pedido.id), { pedido: "PENDIENTE", envio: "EN_PREPARACION" });
      assert.equal((await historialDe(confirmado.pedido.id)).length, 1);
      assert.equal((await historialDe(pendiente.pedido.id)).length, 1);
    });

    it("un envío movido por PUT y luego por PATCH produce una cadena continua sin huecos ni duplicados", async () => {
      const { pedido } = await pedidoEn("EN_PREPARACION");

      assert.equal((await avanzar(pedido.id, "ENVIADO", admin)).status, 200);
      assert.equal((await patchEstado(pedido.id, "EN_TRANSITO", vendedor)).status, 200);
      assert.equal((await avanzar(pedido.id, "ENTREGADO", vendedor)).status, 200);

      const filas = await historialDe(pedido.id);
      for (let i = 1; i < filas.length; i++) {
        assert.equal(filas[i].estadoAnterior, filas[i - 1].estadoNuevo, `hueco en la fila ${i}`);
      }
      assert.deepEqual(filas.map((f) => f.estadoNuevo), [
        "EN_PREPARACION",
        "ENVIADO",
        "EN_TRANSITO",
        "ENTREGADO",
      ]);
    });
  });

  describe("cancelar, cancelar vencidos y webhook de pagos NO tocan el envío", () => {
    it("PATCH /cancelar deja solo la fila del alta", async () => {
      const { pedido, cliente } = await pedidoEn("PENDIENTE");

      const r = await api("PATCH", `/api/v1/pedidos/${pedido.id}/cancelar`, { token: admin.token });

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(await estados(pedido.id), { pedido: "CANCELADO", envio: "EN_PREPARACION" });
      assert.deepEqual(resumen(await historialDe(pedido.id)), [[null, "EN_PREPARACION", cliente.id]]);
    });

    it("POST /vencidos/cancelar deja solo la fila del alta", async () => {
      const { pedido, cliente } = await pedidoEn("PENDIENTE");
      await prisma.pedido.update({
        where: { id: pedido.id },
        data: { creadoEn: new Date(Date.now() - 72 * HORA_MS) },
      });

      const r = await api("POST", "/api/v1/pedidos/vencidos/cancelar", { token: admin.token, body: {} });

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(r.body.cancelados.includes(pedido.id), JSON.stringify(r.body));
      assert.deepEqual(await estados(pedido.id), { pedido: "CANCELADO", envio: "EN_PREPARACION" });
      assert.deepEqual(resumen(await historialDe(pedido.id)), [[null, "EN_PREPARACION", cliente.id]]);
    });

    it("el webhook de Mercado Pago (approved -> CONFIRMADO) deja solo la fila del alta", async () => {
      const { pedido, cliente } = await pedidoEn("PENDIENTE");
      mockObtenerPago.mock.mockImplementation(async ({ id }) => ({
        id: Number(id),
        status: "approved",
        external_reference: String(pedido.id),
        transaction_amount: Number(pedido.total),
        metadata: { pedido_id: pedido.id },
      }));
      const requestId = `req-historial-${pedido.id}`;

      const r = await api("POST", "/api/v1/pagos/mercadopago/webhook", {
        headers: { "x-request-id": requestId, "x-signature": firmar(String(pedido.id), requestId) },
        body: { type: "payment", action: "payment.updated", data: { id: String(pedido.id) } },
      });

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(await estados(pedido.id), { pedido: "CONFIRMADO", envio: "EN_PREPARACION" });
      assert.deepEqual(resumen(await historialDe(pedido.id)), [[null, "EN_PREPARACION", cliente.id]]);
    });
  });

  // Atomicidad: el historial y el cambio de InfoEnvio / Pedido viajan juntos.
  // Se fuerza el fallo del INSERT del historial con un usuario que NO existe:
  // el token (JWT firmado) pasa auth y roleGuard sin consultar la base, pero el
  // FK HistorialEstadoEnvio_usuarioId_fkey rechaza la fila. Si el historial se
  // escribiera fuera de la transacción (o el cambio antes de ella), el
  // InfoEnvio/Pedido quedarían avanzados sin su registro.
  describe("atomicidad: si falla el INSERT del historial, no cambia nada", () => {
    const fantasma = () => ({
      token: generarToken({ id: ID_INEXISTENTE, rolId: 1, rol: { nombre: "admin" } }),
    });

    it("PUT /estado-envio con un usuario inexistente -> 500 y InfoEnvio y Pedido intactos", async () => {
      const { pedido } = await pedidoEn("EN_PREPARACION");
      const infoAntes = await prisma.infoEnvio.findUnique({ where: { pedidoId: pedido.id } });

      const r = await sinLogs(() => avanzar(pedido.id, "ENVIADO", fantasma()));

      assert.equal(r.status, 500, JSON.stringify(r.body));
      assert.deepEqual(await estados(pedido.id), { pedido: "EN_PREPARACION", envio: "EN_PREPARACION" });
      const infoDespues = await prisma.infoEnvio.findUnique({ where: { pedidoId: pedido.id } });
      assert.equal(infoDespues.actualizadoEn.getTime(), infoAntes.actualizadoEn.getTime());
      assert.equal((await historialDe(pedido.id)).length, 1);

      // Sin el fallo, el mismo pedido avanza normalmente (el rollback no lo trabó).
      assert.equal((await avanzar(pedido.id, "ENVIADO", admin)).status, 200);
      assert.equal((await historialDe(pedido.id)).length, 2);
    });

    it("PATCH /estado a un estado de envío con un usuario inexistente -> 500 y nada cambia", async () => {
      const { pedido } = await pedidoEn("EN_PREPARACION");

      const r = await sinLogs(() => patchEstado(pedido.id, "ENVIADO", fantasma()));

      assert.equal(r.status, 500, JSON.stringify(r.body));
      assert.deepEqual(await estados(pedido.id), { pedido: "EN_PREPARACION", envio: "EN_PREPARACION" });
      assert.equal((await historialDe(pedido.id)).length, 1);
    });
  });
});
