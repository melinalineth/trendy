// Tests HTTP reales del pago contra entrega y la consulta de estado de pago
// (RF-037, RF-038, DDS §3 MOD-07; RN-003 aislamiento por usuario, RN-006
// contra entrega solo en zonas autorizadas). Los pedidos se crean directo con
// prisma: la creación por HTTP (POST /api/v1/pedidos) es Sprint 4 / Fase B.
//
// Endpoints:
//   POST  /api/v1/pagos/contra-entrega                  (cliente dueño)
//   GET   /api/v1/pedidos/:id/pago                      (cliente dueño, admin, vendedor)
//   PATCH /api/v1/pagos/:pedidoId/confirmar-recepcion   (admin, vendedor)
//
// Uso: DATABASE_URL=mysql://... npm test
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
  limpiar,
} = require("./helpers/entorno");

function assertErrorEstandar(respuesta, status, codigo) {
  assert.equal(respuesta.status, status, JSON.stringify(respuesta.body));
  assert.deepEqual(Object.keys(respuesta.body.error).sort(), ["codigo", "detalles", "mensaje"]);
  assert.equal(respuesta.body.error.codigo, codigo);
}

describe("Pago contra entrega y consulta de estado (RF-037, RF-038)", () => {
  let servidor;
  let api;
  let admin;
  let vendedor;
  let cliente;
  let otroCliente;
  let variante;
  let zonaHabilitada;
  let zonaSinContraEntrega;

  // Dirección del usuario dentro de la zona indicada (null = sin cobertura).
  function direccionEn(usuarioId, zona) {
    return crearDireccion(
      usuarioId,
      zona ? { ciudad: zona.ciudad, departamento: zona.departamento } : {}
    );
  }

  async function pedidoDe(usuario, { zona = zonaHabilitada, ...opciones } = {}) {
    const direccion = await direccionEn(usuario.id, zona);
    return crearPedido({
      usuarioId: usuario.id,
      direccionId: direccion.id,
      lineas: [{ variante, cantidad: 2, precioUnitario: "15000.50" }],
      costoEnvio: 12000,
      metodoPago: "CONTRA_ENTREGA",
      ...opciones,
    });
  }

  const pagosDe = (pedidoId) => prisma.pago.findMany({ where: { pedidoId } });

  before(async () => {
    servidor = await iniciarServidor();
    api = (metodo, ruta, opciones) => pedir(servidor.baseUrl, metodo, ruta, opciones);
    admin = await crearUsuario("admin");
    vendedor = await crearUsuario("vendedor");
    cliente = await crearUsuario("cliente");
    otroCliente = await crearUsuario("cliente");
    variante = await crearVariante({ stock: 50 });
    zonaHabilitada = await crearZona({ permiteContraEntrega: true });
    zonaSinContraEntrega = await crearZona({ permiteContraEntrega: false });
  });

  after(async () => {
    await servidor.cerrar();
    await limpiar();
  });

  describe("POST /api/v1/pagos/contra-entrega", () => {
    const ruta = "/api/v1/pagos/contra-entrega";

    it("sin token -> 401", async () => {
      const r = await api("POST", ruta, { body: { pedidoId: 1 } });
      assert.equal(r.status, 401);
    });

    it("como admin o vendedor -> 403 ACCESO_DENEGADO", async () => {
      for (const usuario of [admin, vendedor]) {
        const r = await api("POST", ruta, { token: usuario.token, body: { pedidoId: 1 } });
        assertErrorEstandar(r, 403, "ACCESO_DENEGADO");
      }
    });

    it("zona con contra entrega habilitada -> 201, Pago PENDIENTE por el total del pedido", async () => {
      const pedido = await pedidoDe(cliente);

      const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });

      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.pedidoId, pedido.id);
      assert.equal(r.body.metodo, "CONTRA_ENTREGA");
      assert.equal(r.body.estado, "PENDIENTE");
      // total = 2 x 15000.50 + 12000 de envío
      assert.equal(r.body.monto, 42001);
      assert.equal(r.body.referenciaExterna, null);

      const pagos = await pagosDe(pedido.id);
      assert.equal(pagos.length, 1);
      assert.equal(Number(pagos[0].monto), 42001);
      // El pedido no cambia de estado: queda PENDIENTE hasta que se gestione.
      assert.equal(
        (await prisma.pedido.findUnique({ where: { id: pedido.id } })).estado,
        "PENDIENTE"
      );
    });

    it("repetir la solicitud no duplica el Pago (devuelve el mismo)", async () => {
      const pedido = await pedidoDe(cliente);

      const r1 = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });
      const r2 = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });

      assert.equal(r1.status, 201, JSON.stringify(r1.body));
      assert.equal(r2.status, 201, JSON.stringify(r2.body));
      assert.equal(r2.body.id, r1.body.id);
      assert.equal((await pagosDe(pedido.id)).length, 1);
    });

    it("zona SIN contra entrega habilitada -> 409 CONTRA_ENTREGA_NO_DISPONIBLE (RN-006), sin Pago", async () => {
      const pedido = await pedidoDe(cliente, { zona: zonaSinContraEntrega });

      const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });

      assertErrorEstandar(r, 409, "CONTRA_ENTREGA_NO_DISPONIBLE");
      assert.equal((await pagosDe(pedido.id)).length, 0);
    });

    it("dirección sin zona de cobertura -> 409 CONTRA_ENTREGA_NO_DISPONIBLE", async () => {
      const pedido = await pedidoDe(cliente, { zona: null });

      const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });

      assertErrorEstandar(r, 409, "CONTRA_ENTREGA_NO_DISPONIBLE");
    });

    it("zona habilitada pero INACTIVA -> 409 CONTRA_ENTREGA_NO_DISPONIBLE", async () => {
      const zonaInactiva = await crearZona({ permiteContraEntrega: true, estadoZona: "INACTIVO" });
      const pedido = await pedidoDe(cliente, { zona: zonaInactiva });

      const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });

      assertErrorEstandar(r, 409, "CONTRA_ENTREGA_NO_DISPONIBLE");
    });

    it("habilitarla por la API admin la vuelve disponible (RF-037 de punta a punta)", async () => {
      const zona = await crearZona({ permiteContraEntrega: false });
      const pedido = await pedidoDe(cliente, { zona });

      let r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });
      assertErrorEstandar(r, 409, "CONTRA_ENTREGA_NO_DISPONIBLE");

      r = await api("PATCH", `/api/v1/zonas-cobertura/${zona.id}/contra-entrega`, {
        token: admin.token,
        body: { permiteContraEntrega: true },
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));

      r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });
      assert.equal(r.status, 201, JSON.stringify(r.body));
    });

    it("pedido de OTRO cliente -> 404 PEDIDO_NO_ENCONTRADO (RN-003), sin Pago", async () => {
      const pedidoAjeno = await pedidoDe(otroCliente);

      const r = await api("POST", ruta, {
        token: cliente.token,
        body: { pedidoId: pedidoAjeno.id },
      });

      assertErrorEstandar(r, 404, "PEDIDO_NO_ENCONTRADO");
      assert.equal((await pagosDe(pedidoAjeno.id)).length, 0);
    });

    it("pedido inexistente -> 404 PEDIDO_NO_ENCONTRADO", async () => {
      const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: 2147483000 } });
      assertErrorEstandar(r, 404, "PEDIDO_NO_ENCONTRADO");
    });

    it("pedido que ya no está PENDIENTE -> 409 PEDIDO_NO_PENDIENTE", async () => {
      const pedido = await pedidoDe(cliente, { estado: "CANCELADO" });

      const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });

      assertErrorEstandar(r, 409, "PEDIDO_NO_PENDIENTE");
      assert.equal((await pagosDe(pedido.id)).length, 0);
    });

    it("pedido creado para pagar con Mercado Pago -> 409 METODO_PAGO_NO_COINCIDE", async () => {
      const pedido = await pedidoDe(cliente, { metodoPago: "MERCADO_PAGO" });

      const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });

      assertErrorEstandar(r, 409, "METODO_PAGO_NO_COINCIDE");
      assert.equal((await pagosDe(pedido.id)).length, 0);
    });

    it("pedido que ya tiene un Pago de otro método -> 409, sin tocar ese Pago", async () => {
      const pedido = await pedidoDe(cliente);
      await prisma.pago.create({
        data: { pedidoId: pedido.id, metodo: "MERCADO_PAGO", monto: pedido.total },
      });

      const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });

      assertErrorEstandar(r, 409, "METODO_PAGO_NO_COINCIDE");
      const pagos = await pagosDe(pedido.id);
      assert.equal(pagos.length, 1);
      assert.equal(pagos[0].metodo, "MERCADO_PAGO");
    });

    describe("body inválido -> 400 VALIDACION_FALLIDA con detalles", () => {
      const bodies = [
        ["vacío", {}],
        ["pedidoId string", { pedidoId: "1" }],
        ["pedidoId 0", { pedidoId: 0 }],
        ["pedidoId negativo", { pedidoId: -5 }],
        ["pedidoId decimal", { pedidoId: 1.5 }],
        ["pedidoId fuera de Int32", { pedidoId: 2147483648 }],
      ];

      for (const [nombre, body] of bodies) {
        it(nombre, async () => {
          const r = await api("POST", ruta, { token: cliente.token, body });
          assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
          assert.ok(Array.isArray(r.body.error.detalles) && r.body.error.detalles.length > 0);
        });
      }

      it("sin body", async () => {
        const r = await api("POST", ruta, { token: cliente.token });
        assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
      });
    });
  });

  describe("GET /api/v1/pedidos/:id/pago (RF-038)", () => {
    const ruta = (id) => `/api/v1/pedidos/${id}/pago`;
    let pedido;

    before(async () => {
      pedido = await pedidoDe(cliente);
      const r = await api("POST", "/api/v1/pagos/contra-entrega", {
        token: cliente.token,
        body: { pedidoId: pedido.id },
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
    });

    it("sin token -> 401", async () => {
      const r = await api("GET", ruta(pedido.id));
      assert.equal(r.status, 401);
    });

    it("el cliente dueño consulta el estado de su pago -> 200", async () => {
      const r = await api("GET", ruta(pedido.id), { token: cliente.token });

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.pedidoId, pedido.id);
      assert.equal(r.body.metodo, "CONTRA_ENTREGA");
      assert.equal(r.body.estado, "PENDIENTE");
      assert.equal(r.body.monto, 42001);
    });

    it("otro cliente -> 404 PEDIDO_NO_ENCONTRADO (RN-003: no revela que existe)", async () => {
      const r = await api("GET", ruta(pedido.id), { token: otroCliente.token });
      assertErrorEstandar(r, 404, "PEDIDO_NO_ENCONTRADO");
    });

    it("admin y vendedor consultan cualquier pedido -> 200", async () => {
      for (const usuario of [admin, vendedor]) {
        const r = await api("GET", ruta(pedido.id), { token: usuario.token });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.pedidoId, pedido.id);
      }
    });

    it("pedido propio todavía sin pago -> 404 PAGO_NO_ENCONTRADO", async () => {
      const sinPago = await pedidoDe(cliente);
      const r = await api("GET", ruta(sinPago.id), { token: cliente.token });
      assertErrorEstandar(r, 404, "PAGO_NO_ENCONTRADO");
    });

    it("pedido inexistente -> 404 PEDIDO_NO_ENCONTRADO", async () => {
      const r = await api("GET", ruta(2147483000), { token: admin.token });
      assertErrorEstandar(r, 404, "PEDIDO_NO_ENCONTRADO");
    });

    it("id no numérico -> 400 VALIDACION_FALLIDA", async () => {
      const r = await api("GET", ruta("abc"), { token: cliente.token });
      assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
    });
  });

  describe("PATCH /api/v1/pagos/:pedidoId/confirmar-recepcion (RF-037)", () => {
    const ruta = (id) => `/api/v1/pagos/${id}/confirmar-recepcion`;

    async function pedidoConContraEntrega(opciones) {
      const pedido = await pedidoDe(cliente, opciones);
      const r = await api("POST", "/api/v1/pagos/contra-entrega", {
        token: cliente.token,
        body: { pedidoId: pedido.id },
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      return pedido;
    }

    it("sin token -> 401", async () => {
      const r = await api("PATCH", ruta(1));
      assert.equal(r.status, 401);
    });

    it("el cliente (aunque sea el dueño) -> 403 ACCESO_DENEGADO, el pago sigue PENDIENTE", async () => {
      const pedido = await pedidoConContraEntrega();

      const r = await api("PATCH", ruta(pedido.id), { token: cliente.token });

      assertErrorEstandar(r, 403, "ACCESO_DENEGADO");
      assert.equal((await pagosDe(pedido.id))[0].estado, "PENDIENTE");
    });

    it("admin confirma la recepción -> 200 y el Pago queda APROBADO", async () => {
      const pedido = await pedidoConContraEntrega();

      const r = await api("PATCH", ruta(pedido.id), { token: admin.token });

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.estado, "APROBADO");
      assert.equal(r.body.metodo, "CONTRA_ENTREGA");
      assert.equal((await pagosDe(pedido.id))[0].estado, "APROBADO");
    });

    it("vendedor también puede confirmar; repetir es idempotente (200, sigue APROBADO)", async () => {
      const pedido = await pedidoConContraEntrega();

      const r1 = await api("PATCH", ruta(pedido.id), { token: vendedor.token });
      const r2 = await api("PATCH", ruta(pedido.id), { token: vendedor.token });

      assert.equal(r1.status, 200, JSON.stringify(r1.body));
      assert.equal(r2.status, 200, JSON.stringify(r2.body));
      assert.equal(r2.body.estado, "APROBADO");
      assert.equal((await pagosDe(pedido.id)).length, 1);
    });

    it("pedido sin pago registrado -> 409 PAGO_INVALIDO", async () => {
      const pedido = await pedidoDe(cliente);
      const r = await api("PATCH", ruta(pedido.id), { token: admin.token });
      assertErrorEstandar(r, 409, "PAGO_INVALIDO");
    });

    it("pago de Mercado Pago (no contra entrega) -> 409 PAGO_INVALIDO, sin tocarlo", async () => {
      const pedido = await pedidoDe(cliente, { metodoPago: "MERCADO_PAGO" });
      await prisma.pago.create({
        data: { pedidoId: pedido.id, metodo: "MERCADO_PAGO", monto: pedido.total },
      });

      const r = await api("PATCH", ruta(pedido.id), { token: admin.token });

      assertErrorEstandar(r, 409, "PAGO_INVALIDO");
      assert.equal((await pagosDe(pedido.id))[0].estado, "PENDIENTE");
    });

    it("pago contra entrega RECHAZADO o CANCELADO -> 409, no se reabre", async () => {
      for (const estado of ["RECHAZADO", "CANCELADO"]) {
        const pedido = await pedidoConContraEntrega();
        await prisma.pago.update({ where: { pedidoId: pedido.id }, data: { estado } });

        const r = await api("PATCH", ruta(pedido.id), { token: admin.token });

        assertErrorEstandar(r, 409, "PAGO_INVALIDO");
        assert.equal((await pagosDe(pedido.id))[0].estado, estado);
      }
    });

    it("pedido CANCELADO -> 409, el pago sigue PENDIENTE", async () => {
      const pedido = await pedidoConContraEntrega();
      await prisma.pedido.update({ where: { id: pedido.id }, data: { estado: "CANCELADO" } });

      const r = await api("PATCH", ruta(pedido.id), { token: admin.token });

      assertErrorEstandar(r, 409, "PEDIDO_CANCELADO");
      assert.equal((await pagosDe(pedido.id))[0].estado, "PENDIENTE");
    });

    it("pedido inexistente -> 404 PEDIDO_NO_ENCONTRADO", async () => {
      const r = await api("PATCH", ruta(2147483000), { token: admin.token });
      assertErrorEstandar(r, 404, "PEDIDO_NO_ENCONTRADO");
    });

    it("pedidoId no numérico -> 400 VALIDACION_FALLIDA", async () => {
      const r = await api("PATCH", ruta("abc"), { token: admin.token });
      assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
    });
  });
});
