// Tests HTTP del cierre de envío sobre el pedido (RF-027, RF-028, RF-029;
// docs/diseno/info-envio.md y docs/diseno/pedidos-estados.md).
//
// Endpoints:
//   PUT /api/v1/pedidos/:id/estado-envio   admin, vendedor
//   GET /api/v1/pedidos/:id/seguimiento    dueño, admin, vendedor (ajeno -> 404)
//
// Regla: Pedido.estado manda; mientras el pedido está en un estado de envío
// (EN_PREPARACION .. ENTREGADO) InfoEnvio.estadoEnvio vale lo mismo y ambos se
// actualizan en la misma transacción, bajo el lock del pedido.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

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

function assertErrorEstandar(respuesta, status, codigo) {
  assert.equal(respuesta.status, status, JSON.stringify(respuesta.body));
  assert.deepEqual(Object.keys(respuesta.body.error).sort(), ["codigo", "detalles", "mensaje"]);
  assert.equal(respuesta.body.error.codigo, codigo);
}

describe("Envío del pedido: estado y seguimiento (RF-027, RF-028, RF-029)", () => {
  let servidor;
  let api;
  let admin;
  let vendedor;

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
  // el vendedor lo pasa a EN_PREPARACION por PATCH /estado.
  async function pedidoEn(estado, cliente) {
    const duenio = cliente ?? (await clienteConDireccion());
    const variante = await crearVariante({ stock: 10 });
    await agregarAlCarrito(duenio.id, variante, 1);
    const r = await api("POST", "/api/v1/pedidos", {
      token: duenio.token,
      body: { direccionId: duenio.direccion.id, metodoPago: "MERCADO_PAGO" },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const pedido = r.body.pedido;

    if (estado !== "PENDIENTE") {
      await prisma.pedido.update({ where: { id: pedido.id }, data: { estado: "CONFIRMADO" } });
    }
    if (estado === "EN_PREPARACION") {
      const p = await api("PATCH", `/api/v1/pedidos/${pedido.id}/estado`, {
        token: admin.token,
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
  const seguimiento = (pedidoId, usuario) =>
    api("GET", `/api/v1/pedidos/${pedidoId}/seguimiento`, { token: usuario.token });

  const estados = async (pedidoId) => {
    const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: { infoEnvio: true } });
    return { pedido: pedido.estado, envio: pedido.infoEnvio?.estadoEnvio ?? null };
  };

  before(async () => {
    servidor = await iniciarServidor();
    api = (metodo, ruta, opciones) => pedir(servidor.baseUrl, metodo, ruta, opciones);
    admin = await crearUsuario("admin");
    vendedor = await crearUsuario("vendedor");
  });

  after(async () => {
    await servidor.cerrar();
    await limpiar();
  });

  describe("PUT /api/v1/pedidos/:id/estado-envio", () => {
    it("sin token -> 401; cliente -> 403 ACCESO_DENEGADO (RF-029: solo usuarios autorizados)", async () => {
      const { pedido, cliente } = await pedidoEn("EN_PREPARACION");
      assert.equal(
        (await api("PUT", `/api/v1/pedidos/${pedido.id}/estado-envio`, { body: { estadoEnvio: "ENVIADO" } })).status,
        401
      );
      assertErrorEstandar(await avanzar(pedido.id, "ENVIADO", cliente), 403, "ACCESO_DENEGADO");
      assert.deepEqual(await estados(pedido.id), { pedido: "EN_PREPARACION", envio: "EN_PREPARACION" });
    });

    it("avanza EN_PREPARACION -> ENVIADO -> EN_TRANSITO -> ENTREGADO y sincroniza Pedido.estado (admin y vendedor)", async () => {
      const { pedido } = await pedidoEn("EN_PREPARACION");
      let actualizadoAntes = (await prisma.infoEnvio.findUnique({ where: { pedidoId: pedido.id } })).actualizadoEn;

      for (const [estadoEnvio, usuario] of [
        ["ENVIADO", admin],
        ["EN_TRANSITO", vendedor],
        ["ENTREGADO", admin],
      ]) {
        await new Promise((r) => setTimeout(r, 15));
        const r = await avanzar(pedido.id, estadoEnvio, usuario);

        assert.equal(r.status, 200, `${estadoEnvio}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.pedidoId, pedido.id);
        assert.equal(r.body.estadoEnvio, estadoEnvio);
        assert.equal(r.body.estadoPedido, estadoEnvio);
        assert.deepEqual(await estados(pedido.id), { pedido: estadoEnvio, envio: estadoEnvio });
        const actualizado = new Date(r.body.actualizadoEn);
        assert.ok(actualizado > new Date(actualizadoAntes), "actualizadoEn no avanzó");
        actualizadoAntes = actualizado;
      }
    });

    it("saltos, retrocesos, repetir el estado o salir de ENTREGADO -> 409 TRANSICION_ENVIO_INVALIDA sin cambios", async () => {
      const { pedido } = await pedidoEn("EN_PREPARACION");

      for (const estadoEnvio of ["EN_TRANSITO", "ENTREGADO", "EN_PREPARACION"]) {
        assertErrorEstandar(await avanzar(pedido.id, estadoEnvio), 409, "TRANSICION_ENVIO_INVALIDA");
      }
      assert.deepEqual(await estados(pedido.id), { pedido: "EN_PREPARACION", envio: "EN_PREPARACION" });

      for (const estadoEnvio of ["ENVIADO", "EN_TRANSITO", "ENTREGADO"]) {
        assert.equal((await avanzar(pedido.id, estadoEnvio)).status, 200);
      }
      for (const estadoEnvio of ["EN_PREPARACION", "ENVIADO", "EN_TRANSITO", "ENTREGADO"]) {
        assertErrorEstandar(await avanzar(pedido.id, estadoEnvio), 409, "TRANSICION_ENVIO_INVALIDA");
      }
      assert.deepEqual(await estados(pedido.id), { pedido: "ENTREGADO", envio: "ENTREGADO" });
    });

    it("el envío no arranca si el pedido no está en preparación (PENDIENTE, CONFIRMADO, CANCELADO) -> 409", async () => {
      const pendiente = await pedidoEn("PENDIENTE");
      const confirmado = await pedidoEn("CONFIRMADO");
      const cancelado = await pedidoEn("PENDIENTE");
      assert.equal(
        (await api("PATCH", `/api/v1/pedidos/${cancelado.pedido.id}/cancelar`, { token: admin.token })).status,
        200
      );

      for (const [{ pedido }, estadoPedido] of [
        [pendiente, "PENDIENTE"],
        [confirmado, "CONFIRMADO"],
        [cancelado, "CANCELADO"],
      ]) {
        assertErrorEstandar(await avanzar(pedido.id, "ENVIADO"), 409, "TRANSICION_ENVIO_INVALIDA");
        assert.deepEqual(await estados(pedido.id), { pedido: estadoPedido, envio: "EN_PREPARACION" });
      }
    });

    it("pedido en preparación sin InfoEnvio -> 409 ENVIO_NO_REGISTRADO", async () => {
      const cliente = await clienteConDireccion();
      const variante = await crearVariante({ stock: 5 });
      const pedido = await crearPedido({
        usuarioId: cliente.id,
        direccionId: cliente.direccion.id,
        lineas: [{ variante, cantidad: 1 }],
        estado: "EN_PREPARACION",
      });

      assertErrorEstandar(await avanzar(pedido.id, "ENVIADO"), 409, "ENVIO_NO_REGISTRADO");
    });

    it("tres avances SIMULTÁNEOS al mismo estado: exactamente uno gana", async () => {
      for (let ronda = 0; ronda < 4; ronda++) {
        const { pedido } = await pedidoEn("EN_PREPARACION");

        const respuestas = await Promise.all([
          avanzar(pedido.id, "ENVIADO", admin),
          avanzar(pedido.id, "ENVIADO", vendedor),
          avanzar(pedido.id, "ENVIADO", admin),
        ]);

        assert.deepEqual(
          respuestas.map((r) => r.status).sort(),
          [200, 409, 409],
          JSON.stringify(respuestas.map((r) => r.body))
        );
        assert.deepEqual(await estados(pedido.id), { pedido: "ENVIADO", envio: "ENVIADO" });
      }
    });

    it("pedido inexistente -> 404; body inválido -> 400 VALIDACION_FALLIDA", async () => {
      assertErrorEstandar(await avanzar(2147483000, "ENVIADO"), 404, "PEDIDO_NO_ENCONTRADO");

      const { pedido } = await pedidoEn("EN_PREPARACION");
      for (const body of [{}, { estadoEnvio: "enviado" }, { estadoEnvio: "CANCELADO" }, { estadoEnvio: "ENVIADO", x: 1 }]) {
        const r = await api("PUT", `/api/v1/pedidos/${pedido.id}/estado-envio`, { token: admin.token, body });
        assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
      }
      assert.deepEqual(await estados(pedido.id), { pedido: "EN_PREPARACION", envio: "EN_PREPARACION" });
    });
  });

  describe("GET /api/v1/pedidos/:id/seguimiento", () => {
    it("el dueño ve estado de envío, estado del pedido, dirección de entrega y fecha del último cambio", async () => {
      const { pedido, cliente } = await pedidoEn("EN_PREPARACION");
      assert.equal((await avanzar(pedido.id, "ENVIADO")).status, 200);

      const r = await seguimiento(pedido.id, cliente);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.pedidoId, pedido.id);
      assert.equal(r.body.numero, pedido.numero);
      assert.equal(r.body.estadoPedido, "ENVIADO");
      assert.equal(r.body.estadoEnvio, "ENVIADO");
      assert.equal(r.body.costoEnvio, 8000);
      assert.ok(!Number.isNaN(new Date(r.body.actualizadoEn).getTime()));
      assert.equal(r.body.direccion.id, cliente.direccion.id);
      assert.equal(r.body.direccion.destinatario, "Destinatario Test");
      assert.equal(r.body.direccion.telefono, "3000000000");
      assert.equal(r.body.direccion.ciudad, cliente.direccion.ciudad);
    });

    it("admin y vendedor ven cualquier seguimiento; un cliente ajeno recibe 404 como si no existiera", async () => {
      const { pedido } = await pedidoEn("PENDIENTE");
      const intruso = await crearUsuario("cliente");

      for (const usuario of [admin, vendedor]) {
        const r = await seguimiento(pedido.id, usuario);
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.estadoPedido, "PENDIENTE");
        assert.equal(r.body.estadoEnvio, "EN_PREPARACION");
      }

      const ajeno = await seguimiento(pedido.id, intruso);
      const inexistente = await seguimiento(2147483000, intruso);
      assertErrorEstandar(ajeno, 404, "PEDIDO_NO_ENCONTRADO");
      assertErrorEstandar(inexistente, 404, "PEDIDO_NO_ENCONTRADO");
      assert.equal(ajeno.body.error.mensaje, inexistente.body.error.mensaje);
      assert.equal((await api("GET", `/api/v1/pedidos/${pedido.id}/seguimiento`)).status, 401);
    });

    it("pedido sin InfoEnvio -> 404 ENVIO_NO_REGISTRADO", async () => {
      const cliente = await clienteConDireccion();
      const variante = await crearVariante({ stock: 5 });
      const pedido = await crearPedido({
        usuarioId: cliente.id,
        direccionId: cliente.direccion.id,
        lineas: [{ variante, cantidad: 1 }],
        estado: "CONFIRMADO",
      });

      assertErrorEstandar(await seguimiento(pedido.id, cliente), 404, "ENVIO_NO_REGISTRADO");
    });
  });
});
