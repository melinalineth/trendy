// Tests HTTP de la cancelación de pedidos con reposición de stock (ERS
// RF-019 "un pedido cancelado liberará el stock", RF-033) y de la
// cancelación de pedidos vencidos.
//
// Endpoints:
//   PATCH /api/v1/pedidos/:id/cancelar        admin y vendedor (el cliente: 403)
//   POST  /api/v1/pedidos/vencidos/cancelar   admin
//
// Invariantes que se prueban (también con concurrencia real):
//   - la reposición ocurre UNA sola vez por pedido (la idempotencia sale del
//     estado leído bajo el lock del pedido: reponerPorPedido no es idempotente);
//   - un pedido con Pago APROBADO nunca se cancela (409, el reembolso es
//     manual) y un "approved" que llega después de cancelar responde
//     requiereReembolso (pago.service);
//   - un pedido de MERCADO_PAGO confirmado o en su ciclo de envío no se
//     cancela (409);
//   - vencidos: solo MERCADO_PAGO PENDIENTE viejos sin pago aprobado.
//
// La cancelación de un pedido CONTRA ENTREGA ya confirmado (CONFIRMADO ..
// EN_TRANSITO), que repone el stock y anula la venta, y sus 409 (ENTREGADO,
// Pago APROBADO, Mercado Pago) están en venta.registro.http.test.js; las reglas
// puras, en pedido.cancelabilidad.test.js.
//
// El SDK de Mercado Pago se mockea (ningún test sale a la red); la firma del
// webhook se calcula con el HMAC real que valida el SDK.
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
const { MARGEN_VENCIMIENTO_MS } = require("../src/services/pedido.service");

const HORA_MS = 60 * 60 * 1000;

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

// Ejecuta `fn` capturando console.error; devuelve { resultado, lineas }.
async function conLogs(fn) {
  const mockLog = mock.method(console, "error", () => {});
  try {
    const resultado = await fn();
    return { resultado, lineas: mockLog.mock.calls.map((c) => c.arguments.join(" ")) };
  } finally {
    mockLog.mock.restore();
  }
}

describe("Cancelación de pedidos y pedidos vencidos", () => {
  let servidor;
  let api;
  let admin;
  let vendedor;
  let mockObtenerPago;

  const stockDe = async (id) => (await prisma.variante.findUnique({ where: { id } })).stock;
  const estadoDe = async (id) => (await prisma.pedido.findUnique({ where: { id } })).estado;
  const pagoDe = (pedidoId) => prisma.pago.findUnique({ where: { pedidoId } });
  const entradasDe = (varianteId) =>
    prisma.inventarioMovimiento.findMany({
      where: { varianteId, tipoAjuste: "ENTRADA" },
      orderBy: { id: "asc" },
    });

  async function clienteConDireccion({ permiteContraEntrega = false } = {}) {
    const cliente = await crearUsuario("cliente");
    const zona = await crearZona({ costo: "12000.00", permiteContraEntrega });
    const direccion = await crearDireccion(cliente.id, {
      ciudad: zona.ciudad,
      departamento: zona.departamento,
    });
    return { ...cliente, direccion };
  }

  // Pedido creado por el flujo real (POST /pedidos): stock ya descontado.
  // Devuelve { pedido, variantes, cliente }.
  async function pedidoReal({
    cliente,
    metodoPago = "MERCADO_PAGO",
    lineas = [{ stock: 10, cantidad: 2 }],
  } = {}) {
    const duenio = cliente ?? (await clienteConDireccion({ permiteContraEntrega: true }));
    const variantes = [];
    for (const { stock, cantidad } of lineas) {
      const variante = await crearVariante({ stock });
      await agregarAlCarrito(duenio.id, variante, cantidad);
      variantes.push(variante);
    }
    const r = await api("POST", "/api/v1/pedidos", {
      token: duenio.token,
      body: { direccionId: duenio.direccion.id, metodoPago },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return { pedido: r.body.pedido, variantes, cliente: duenio };
  }

  const cancelar = (pedidoId, usuario) =>
    api("PATCH", `/api/v1/pedidos/${pedidoId}/cancelar`, { token: usuario.token });

  const vencidos = (body, usuario = admin) =>
    api("POST", "/api/v1/pedidos/vencidos/cancelar", { token: usuario.token, body });

  let contadorRequest = 0;
  function webhook(paymentId) {
    const requestId = `req-cancel-${++contadorRequest}`;
    return api("POST", "/api/v1/pagos/mercadopago/webhook", {
      headers: { "x-request-id": requestId, "x-signature": firmar(String(paymentId), requestId) },
      body: { type: "payment", action: "payment.updated", data: { id: String(paymentId) } },
    });
  }

  function aprobarEnMercadoPago(pedido) {
    mockObtenerPago.mock.mockImplementation(async ({ id }) => ({
      id: Number(id),
      status: "approved",
      external_reference: String(pedido.id),
      transaction_amount: Number(pedido.total),
      metadata: { pedido_id: pedido.id },
    }));
  }

  const atrasarMs = (pedidoId, ms) =>
    prisma.pedido.update({
      where: { id: pedidoId },
      data: { creadoEn: new Date(Date.now() - ms) },
    });
  const atrasar = (pedidoId, horas) => atrasarMs(pedidoId, horas * HORA_MS);

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

  describe("PATCH /api/v1/pedidos/:id/cancelar", () => {
    it("sin token -> 401", async () => {
      const r = await api("PATCH", "/api/v1/pedidos/1/cancelar");
      assert.equal(r.status, 401);
    });

    it("id inválido -> 400 VALIDACION_FALLIDA", async () => {
      for (const id of ["abc", "0", "-1", "1.5"]) {
        assertErrorEstandar(await cancelar(id, admin), 400, "VALIDACION_FALLIDA");
      }
    });

    // ERS v1.2 §2.8.3 y matriz §4.1: en el MVP la cancelación la gestiona el
    // personal (RF-033, cancelación por el propio cliente, es v2.0).
    it("el cliente NO puede cancelar, ni su propio pedido -> 403 ACCESO_DENEGADO y nada cambia", async () => {
      const { pedido, variantes, cliente } = await pedidoReal();
      const otro = await crearUsuario("cliente");

      for (const usuario of [cliente, otro]) {
        assertErrorEstandar(await cancelar(pedido.id, usuario), 403, "ACCESO_DENEGADO");
      }
      assert.equal(await estadoDe(pedido.id), "PENDIENTE");
      assert.equal(await stockDe(variantes[0].id), 8);
      assert.deepEqual(await entradasDe(variantes[0].id), []);
    });

    it("el personal cancela un pedido PENDIENTE: 200 CANCELADO y repone el stock exacto (un movimiento ENTRADA por línea)", async () => {
      const { pedido, variantes, cliente } = await pedidoReal({
        lineas: [
          { stock: 10, cantidad: 2 },
          { stock: 4, cantidad: 3 },
        ],
      });
      assert.equal(await stockDe(variantes[0].id), 8);
      assert.equal(await stockDe(variantes[1].id), 1);

      const r = await cancelar(pedido.id, admin);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.pedido.estado, "CANCELADO");
      assert.equal(r.body.yaCancelado, false);
      assert.equal(await estadoDe(pedido.id), "CANCELADO");
      assert.equal(await stockDe(variantes[0].id), 10);
      assert.equal(await stockDe(variantes[1].id), 4);
      for (const [variante, cantidad] of [
        [variantes[0], 2],
        [variantes[1], 3],
      ]) {
        const entradas = await entradasDe(variante.id);
        assert.equal(entradas.length, 1);
        assert.equal(entradas[0].cantidad, cantidad);
        assert.equal(entradas[0].usuarioId, cliente.id);
        assert.match(entradas[0].motivo, /Pedido cancelado/);
        assert.ok(entradas[0].motivo.includes(`#${pedido.id}`), entradas[0].motivo);
      }
    });

    it("admin y vendedor cancelan pedidos de cualquier cliente (la reposición queda a nombre del dueño)", async () => {
      for (const usuario of [admin, vendedor]) {
        const { pedido, variantes, cliente } = await pedidoReal();

        const r = await cancelar(pedido.id, usuario);

        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(await estadoDe(pedido.id), "CANCELADO");
        assert.equal(await stockDe(variantes[0].id), 10);
        assert.equal((await entradasDe(variantes[0].id))[0].usuarioId, cliente.id);
      }
    });

    it("pedido inexistente -> 404 PEDIDO_NO_ENCONTRADO", async () => {
      assertErrorEstandar(await cancelar(2147483000, vendedor), 404, "PEDIDO_NO_ENCONTRADO");
    });

    it("cancelar dos veces es idempotente: 200 yaCancelado y NO repone de nuevo", async () => {
      const { pedido, variantes, cliente } = await pedidoReal();
      assert.equal((await cancelar(pedido.id, admin)).status, 200);

      const r = await cancelar(pedido.id, admin);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.yaCancelado, true);
      assert.equal(r.body.pedido.estado, "CANCELADO");
      assert.equal(await stockDe(variantes[0].id), 10);
      assert.equal((await entradasDe(variantes[0].id)).length, 1);
    });

    it("5 cancelaciones SIMULTÁNEAS del mismo pedido: todas 200, el stock se repone UNA sola vez", async () => {
      const { pedido, variantes, cliente } = await pedidoReal();

      const respuestas = await Promise.all([
        cancelar(pedido.id, admin),
        cancelar(pedido.id, admin),
        cancelar(pedido.id, admin),
        cancelar(pedido.id, vendedor),
        cancelar(pedido.id, admin),
      ]);

      assert.deepEqual(
        respuestas.map((r) => r.status),
        Array(5).fill(200),
        JSON.stringify(respuestas.map((r) => r.body))
      );
      assert.equal(respuestas.filter((r) => r.body.yaCancelado === false).length, 1);
      assert.equal(await stockDe(variantes[0].id), 10);
      assert.equal((await entradasDe(variantes[0].id)).length, 1);
    });

    it("con Pago APROBADO -> 409 PEDIDO_NO_CANCELABLE, sin reponer, y log de una línea para el reembolso manual", async () => {
      const { pedido, variantes, cliente } = await pedidoReal();
      await prisma.pago.create({
        data: {
          pedidoId: pedido.id,
          metodo: "MERCADO_PAGO",
          estado: "APROBADO",
          referenciaExterna: "pago-aprobado-1",
          monto: String(pedido.total),
        },
      });

      const { resultado: r, lineas } = await conLogs(() => cancelar(pedido.id, admin));

      assertErrorEstandar(r, 409, "PEDIDO_NO_CANCELABLE");
      assert.equal(await estadoDe(pedido.id), "PENDIENTE");
      assert.equal(await stockDe(variantes[0].id), 8);
      assert.deepEqual(await entradasDe(variantes[0].id), []);
      const linea = lineas.find((l) => l.includes("CANCELACION_RECHAZADA_CON_PAGO_APROBADO"));
      assert.ok(linea, JSON.stringify(lineas));
      assert.ok(!linea.includes("\n"));
      assert.deepEqual(JSON.parse(linea), {
        evento: "CANCELACION_RECHAZADA_CON_PAGO_APROBADO",
        pedidoId: pedido.id,
      });
    });

    it("pedido de Mercado Pago ya confirmado o en su ciclo de envío -> 409 PEDIDO_NO_CANCELABLE sin reponer", async () => {
      const cliente = await clienteConDireccion();
      for (const estado of [
        "PAGO_APROBADO",
        "CONFIRMADO",
        "EN_PREPARACION",
        "ENVIADO",
        "EN_TRANSITO",
        "ENTREGADO",
      ]) {
        const variante = await crearVariante({ stock: 3 });
        const pedido = await crearPedido({
          usuarioId: cliente.id,
          direccionId: cliente.direccion.id,
          lineas: [{ variante, cantidad: 2 }],
          estado,
        });

        const r = await cancelar(pedido.id, admin);

        assertErrorEstandar(r, 409, "PEDIDO_NO_CANCELABLE");
        assert.equal(await estadoDe(pedido.id), estado);
        assert.equal(await stockDe(variante.id), 3);
      }
    });

    it("estados legados PAGO_PENDIENTE / PAGO_RECHAZADO sin pago aprobado: se cancelan y reponen", async () => {
      const cliente = await clienteConDireccion();
      for (const estado of ["PAGO_PENDIENTE", "PAGO_RECHAZADO"]) {
        // Stock 1 = ya descontadas las 2 unidades del pedido.
        const variante = await crearVariante({ stock: 1 });
        const pedido = await crearPedido({
          usuarioId: cliente.id,
          direccionId: cliente.direccion.id,
          lineas: [{ variante, cantidad: 2 }],
          estado,
        });

        const r = await cancelar(pedido.id, admin);

        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(await estadoDe(pedido.id), "CANCELADO");
        assert.equal(await stockDe(variante.id), 3);
      }
    });

    it("con un intento de pago RECHAZADO (no es final): se cancela y repone; el Pago sigue RECHAZADO", async () => {
      const { pedido, variantes, cliente } = await pedidoReal();
      await prisma.pago.create({
        data: {
          pedidoId: pedido.id,
          metodo: "MERCADO_PAGO",
          estado: "RECHAZADO",
          referenciaExterna: "rechazado-1",
          monto: String(pedido.total),
        },
      });

      const r = await cancelar(pedido.id, admin);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(await stockDe(variantes[0].id), 10);
      assert.equal((await pagoDe(pedido.id)).estado, "RECHAZADO");
    });

    it("contra entrega con el Pago PENDIENTE registrado: se cancela, repone y el Pago pasa a CANCELADO", async () => {
      const { pedido, variantes, cliente } = await pedidoReal({ metodoPago: "CONTRA_ENTREGA" });
      const registro = await api("POST", "/api/v1/pagos/contra-entrega", {
        token: cliente.token,
        body: { pedidoId: pedido.id },
      });
      assert.equal(registro.status, 201, JSON.stringify(registro.body));

      const r = await cancelar(pedido.id, admin);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(await stockDe(variantes[0].id), 10);
      assert.equal((await pagoDe(pedido.id)).estado, "CANCELADO");
      assert.equal(r.body.pedido.pago.estado, "CANCELADO");
      // La recepción de un pago de un pedido cancelado ya no se puede confirmar.
      const confirmar = await api("PATCH", `/api/v1/pagos/${pedido.id}/confirmar-recepcion`, {
        token: admin.token,
      });
      assert.equal(confirmar.status, 409, JSON.stringify(confirmar.body));
    });
  });

  describe("cancelación vs webhook 'approved' sobre el mismo pedido (se resuelven por el lock)", () => {
    it("gana la cancelación: el approved posterior responde 200 requiereReembolso y el pedido sigue CANCELADO", async () => {
      const { pedido, variantes, cliente } = await pedidoReal();
      aprobarEnMercadoPago(pedido);

      assert.equal((await cancelar(pedido.id, admin)).status, 200);
      const { resultado: r } = await conLogs(() => webhook(70001));

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.requiereReembolso, true);
      assert.equal(await estadoDe(pedido.id), "CANCELADO");
      assert.equal((await pagoDe(pedido.id)).estado, "APROBADO");
      // Repuesto una vez por la cancelación; el pago no lo vuelve a descontar.
      assert.equal(await stockDe(variantes[0].id), 10);
    });

    it("gana el approved: la cancelación posterior responde 409 PEDIDO_NO_CANCELABLE y el stock sigue reservado", async () => {
      const { pedido, variantes, cliente } = await pedidoReal();
      aprobarEnMercadoPago(pedido);

      assert.equal((await webhook(70002)).status, 200);
      const { resultado: r } = await conLogs(() => cancelar(pedido.id, admin));

      assertErrorEstandar(r, 409, "PEDIDO_NO_CANCELABLE");
      assert.equal(await estadoDe(pedido.id), "CONFIRMADO");
      assert.equal(await stockDe(variantes[0].id), 8);
      assert.deepEqual(await entradasDe(variantes[0].id), []);
    });

    it("SIMULTÁNEOS (varias rondas): siempre uno de los dos desenlaces coherentes, nunca a medias", async () => {
      const desenlaces = new Set();

      for (let ronda = 0; ronda < 8; ronda++) {
        const { pedido, variantes, cliente } = await pedidoReal();
        aprobarEnMercadoPago(pedido);

        // Los dos pedidos viajan en paralelo; en las rondas impares la
        // cancelación sale unos ms más tarde (el webhook hace una lectura
        // previa a su transacción y, sin el desfase, casi siempre llega
        // segundo al lock). Así se ejercitan ambos órdenes.
        const desfaseMs = ronda % 2 === 0 ? 0 : 5 + ronda * 3;
        const { resultado: [rc, rw] } = await conLogs(() =>
          Promise.all([
            new Promise((r) => setTimeout(r, desfaseMs)).then(() => cancelar(pedido.id, admin)),
            webhook(70100 + ronda),
          ])
        );

        const estado = await estadoDe(pedido.id);
        const pago = await pagoDe(pedido.id);
        const stock = await stockDe(variantes[0].id);
        const entradas = (await entradasDe(variantes[0].id)).length;
        assert.equal(rw.status, 200, JSON.stringify(rw.body));
        assert.equal(pago.estado, "APROBADO");

        if (rc.status === 200) {
          // Ganó la cancelación.
          desenlaces.add("cancelacion");
          assert.equal(rw.body.requiereReembolso, true, JSON.stringify(rw.body));
          assert.equal(estado, "CANCELADO");
          assert.equal(stock, 10);
          assert.equal(entradas, 1);
        } else {
          // Ganó el approved.
          desenlaces.add("approved");
          assertErrorEstandar(rc, 409, "PEDIDO_NO_CANCELABLE");
          assert.equal(rw.body.procesado, true, JSON.stringify(rw.body));
          assert.equal(estado, "CONFIRMADO");
          assert.equal(stock, 8);
          assert.equal(entradas, 0);
        }
      }

      // Con el desfase se observan ambos desenlaces en la práctica, pero no
      // se exige (dependería de los tiempos de la máquina): el orden
      // determinístico lo cubren los dos tests anteriores.
      assert.ok(desenlaces.size >= 1);
    });
  });

  describe("POST /api/v1/pedidos/vencidos/cancelar", () => {
    it("sin token -> 401; cliente o vendedor -> 403 ACCESO_DENEGADO", async () => {
      const r = await api("POST", "/api/v1/pedidos/vencidos/cancelar", { body: {} });
      assert.equal(r.status, 401);

      const cliente = await crearUsuario("cliente");
      for (const usuario of [cliente, vendedor]) {
        assertErrorEstandar(await vencidos({}, usuario), 403, "ACCESO_DENEGADO");
      }
    });

    describe("body inválido -> 400 VALIDACION_FALLIDA", () => {
      for (const [nombre, body] of [
        ["horas 0", { horas: 0 }],
        ["horas 169", { horas: 169 }],
        ["horas string", { horas: "5" }],
        ["horas decimal", { horas: 2.5 }],
        ["campos extra", { horas: 5, todos: true }],
      ]) {
        it(nombre, async () => {
          const r = await vencidos(body);
          assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
          assert.ok(r.body.error.detalles.length > 0);
        });
      }
    });

    it("cancela SOLO los MERCADO_PAGO PENDIENTE viejos sin pago aprobado, repone una vez y no toca el resto", async () => {
      const cliente = await clienteConDireccion({ permiteContraEntrega: true });

      const viejo = await pedidoReal({ cliente });
      await atrasar(viejo.pedido.id, 30);

      const viejoRechazado = await pedidoReal({ cliente });
      await atrasar(viejoRechazado.pedido.id, 30);
      await prisma.pago.create({
        data: {
          pedidoId: viejoRechazado.pedido.id,
          metodo: "MERCADO_PAGO",
          estado: "RECHAZADO",
          referenciaExterna: "rech-v",
          monto: String(viejoRechazado.pedido.total),
        },
      });

      const reciente = await pedidoReal({ cliente });

      const contraEntrega = await pedidoReal({ cliente, metodoPago: "CONTRA_ENTREGA" });
      await atrasar(contraEntrega.pedido.id, 30);

      const aprobado = await pedidoReal({ cliente });
      await atrasar(aprobado.pedido.id, 30);
      await prisma.pago.create({
        data: {
          pedidoId: aprobado.pedido.id,
          metodo: "MERCADO_PAGO",
          estado: "APROBADO",
          referenciaExterna: "aprob-v",
          monto: String(aprobado.pedido.total),
        },
      });

      const confirmado = await pedidoReal({ cliente });
      await atrasar(confirmado.pedido.id, 30);
      await prisma.pedido.update({
        where: { id: confirmado.pedido.id },
        data: { estado: "CONFIRMADO" },
      });

      const r = await vencidos({ horas: 24 });

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(Array.isArray(r.body.cancelados));
      assert.ok(Array.isArray(r.body.omitidos));
      assert.ok(r.body.cancelados.includes(viejo.pedido.id));
      assert.ok(r.body.cancelados.includes(viejoRechazado.pedido.id));
      for (const intacto of [reciente, contraEntrega, aprobado, confirmado]) {
        assert.ok(!r.body.cancelados.includes(intacto.pedido.id));
      }

      assert.equal(await estadoDe(viejo.pedido.id), "CANCELADO");
      assert.equal(await estadoDe(viejoRechazado.pedido.id), "CANCELADO");
      assert.equal(await estadoDe(reciente.pedido.id), "PENDIENTE");
      assert.equal(await estadoDe(contraEntrega.pedido.id), "PENDIENTE");
      assert.equal(await estadoDe(aprobado.pedido.id), "PENDIENTE");
      assert.equal(await estadoDe(confirmado.pedido.id), "CONFIRMADO");

      assert.equal(await stockDe(viejo.variantes[0].id), 10);
      assert.equal(await stockDe(viejoRechazado.variantes[0].id), 10);
      for (const intacto of [reciente, contraEntrega, aprobado, confirmado]) {
        assert.equal(await stockDe(intacto.variantes[0].id), 8);
      }

      // Una segunda corrida no los vuelve a cancelar ni repone otra vez.
      const otra = await vencidos({ horas: 24 });
      assert.equal(otra.status, 200, JSON.stringify(otra.body));
      assert.ok(!otra.body.cancelados.includes(viejo.pedido.id));
      assert.equal(await stockDe(viejo.variantes[0].id), 10);
      assert.equal((await entradasDe(viejo.variantes[0].id)).length, 1);
    });

    it("sin body usa MERCADOPAGO_PREFERENCIA_HORAS con el mismo parseo que pagos (inválida -> 24)", async () => {
      const anterior = process.env.MERCADOPAGO_PREFERENCIA_HORAS;
      try {
        const { pedido, variantes } = await pedidoReal();
        await atrasar(pedido.id, 3);

        // Valor inválido -> default 24 h: un pedido de 3 h todavía no venció.
        process.env.MERCADOPAGO_PREFERENCIA_HORAS = "abc";
        const sinVencer = await vencidos(undefined);
        assert.equal(sinVencer.status, 200, JSON.stringify(sinVencer.body));
        assert.ok(!sinVencer.body.cancelados.includes(pedido.id));
        assert.equal(await estadoDe(pedido.id), "PENDIENTE");

        // 2 h -> el pedido de 3 h venció.
        process.env.MERCADOPAGO_PREFERENCIA_HORAS = " 2 ";
        const r = await vencidos(undefined);
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.ok(r.body.cancelados.includes(pedido.id));
        assert.equal(await stockDe(variantes[0].id), 10);
      } finally {
        if (anterior === undefined) delete process.env.MERCADOPAGO_PREFERENCIA_HORAS;
        else process.env.MERCADOPAGO_PREFERENCIA_HORAS = anterior;
      }
    });

    // La preferencia de pago de un pedido vive hasta creadoEn + horas
    // (pago.service). Vencidos corta en horas + MARGEN_VENCIMIENTO_MS para no
    // cancelar un pedido cuya preferencia todavía se puede pagar.
    it("respeta el margen: con 2 h configuradas no cancela un pedido de 2 h + margen - 5 min y sí uno de 2 h + margen + 5 min", async () => {
      const anterior = process.env.MERCADOPAGO_PREFERENCIA_HORAS;
      process.env.MERCADOPAGO_PREFERENCIA_HORAS = "2";
      try {
        const dentro = await pedidoReal();
        const fuera = await pedidoReal();
        await atrasarMs(dentro.pedido.id, 2 * HORA_MS + MARGEN_VENCIMIENTO_MS - 5 * 60 * 1000);
        await atrasarMs(fuera.pedido.id, 2 * HORA_MS + MARGEN_VENCIMIENTO_MS + 5 * 60 * 1000);

        const r = await vencidos(undefined);

        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.ok(!r.body.cancelados.includes(dentro.pedido.id));
        assert.ok(r.body.cancelados.includes(fuera.pedido.id));
        assert.equal(await estadoDe(dentro.pedido.id), "PENDIENTE");
        assert.equal(await estadoDe(fuera.pedido.id), "CANCELADO");
      } finally {
        if (anterior === undefined) delete process.env.MERCADOPAGO_PREFERENCIA_HORAS;
        else process.env.MERCADOPAGO_PREFERENCIA_HORAS = anterior;
      }
    });

    it("`horas` del body es un PISO: horas 1 no cancela un pedido de 2 h si la vigencia configurada es 24 h", async () => {
      const anterior = process.env.MERCADOPAGO_PREFERENCIA_HORAS;
      delete process.env.MERCADOPAGO_PREFERENCIA_HORAS;
      try {
        const { pedido, variantes } = await pedidoReal();
        await atrasar(pedido.id, 2);

        const r = await vencidos({ horas: 1 });

        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.horas, 24);
        assert.ok(!r.body.cancelados.includes(pedido.id));
        assert.equal(await estadoDe(pedido.id), "PENDIENTE");
        assert.equal(await stockDe(variantes[0].id), 8);

        // Un valor MAYOR que la vigencia sí se respeta (es más conservador).
        const mayor = await vencidos({ horas: 48 });
        assert.equal(mayor.body.horas, 48);
      } finally {
        if (anterior !== undefined) process.env.MERCADOPAGO_PREFERENCIA_HORAS = anterior;
      }
    });

    it("vencidos y una cancelación SIMULTÁNEOS sobre el mismo pedido: se repone una sola vez", async () => {
      for (let ronda = 0; ronda < 4; ronda++) {
        const { pedido, variantes, cliente } = await pedidoReal();
        await atrasar(pedido.id, 48);

        const [rv, rc] = await Promise.all([vencidos({ horas: 24 }), cancelar(pedido.id, admin)]);

        assert.equal(rv.status, 200, JSON.stringify(rv.body));
        assert.equal(rc.status, 200, JSON.stringify(rc.body));
        assert.equal(await estadoDe(pedido.id), "CANCELADO");
        assert.equal(await stockDe(variantes[0].id), 10);
        assert.equal((await entradasDe(variantes[0].id)).length, 1);
      }
    });
  });
});
