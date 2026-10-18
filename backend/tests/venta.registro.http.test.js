// Registro de ventas (Sprint 5, RF-041; RN-008, RN-009) a través de los
// flujos reales: webhook de Mercado Pago, cambio manual de estado
// (PATCH /pedidos/:id/estado) y cancelación (PATCH /pedidos/:id/cancelar).
//
// Reglas que se prueban (docs/diseno/pedidos-estados.md):
//   - la venta nace con TODA transición a CONFIRMADO, en la MISMA transacción
//     que el cambio de estado (si el registro falla, el estado no cambia);
//   - es idempotente: un webhook repetido, un pago duplicado o dos
//     confirmaciones simultáneas no crean una segunda venta (RN-009);
//   - los montos se COPIAN del pedido (RN-008);
//   - cancelar un pedido contra entrega ya confirmado anula su venta (nunca la
//     borra) y repone el stock una sola vez.
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
const ventaRepository = require("../src/repositories/venta.repository");

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

describe("Registro de ventas desde los flujos de pedidos (RF-041)", () => {
  let servidor;
  let api;
  let admin;
  let vendedor;
  let mockObtenerPago;

  const pedidoEnBase = (id) => prisma.pedido.findUnique({ where: { id } });
  const estadoDe = async (id) => (await pedidoEnBase(id)).estado;
  const stockDe = async (id) => (await prisma.variante.findUnique({ where: { id } })).stock;
  const ventaDe = (pedidoId) => prisma.venta.findUnique({ where: { pedidoId } });
  const ventasDe = (pedidoId) => prisma.venta.count({ where: { pedidoId } });
  const pagoDe = (pedidoId) => prisma.pago.findUnique({ where: { pedidoId } });

  async function clienteConDireccion() {
    const cliente = await crearUsuario("cliente");
    const zona = await crearZona({ costo: "12000.00", permiteContraEntrega: true });
    const direccion = await crearDireccion(cliente.id, {
      ciudad: zona.ciudad,
      departamento: zona.departamento,
    });
    return { ...cliente, direccion };
  }

  // Pedido creado por el flujo real (POST /pedidos): stock ya descontado.
  async function pedidoReal({ cliente, metodoPago = "MERCADO_PAGO", precio = "19990.00" } = {}) {
    const duenio = cliente ?? (await clienteConDireccion());
    const variante = await crearVariante({ precio, stock: 10 });
    await agregarAlCarrito(duenio.id, variante, 2);
    const r = await api("POST", "/api/v1/pedidos", {
      token: duenio.token,
      body: { direccionId: duenio.direccion.id, metodoPago },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return { pedido: r.body.pedido, variante, cliente: duenio };
  }

  let contadorRequest = 0;
  function webhook(paymentId) {
    const requestId = `req-venta-${++contadorRequest}`;
    return api("POST", "/api/v1/pagos/mercadopago/webhook", {
      headers: { "x-request-id": requestId, "x-signature": firmar(String(paymentId), requestId) },
      body: { type: "payment", action: "payment.updated", data: { id: String(paymentId) } },
    });
  }

  // Mercado Pago responde `status` para el pago `id` del pedido (monto = total).
  function responderMercadoPago(pedido, status = "approved", montoDe = () => pedido.total) {
    mockObtenerPago.mock.mockImplementation(async ({ id }) => ({
      id: Number(id),
      status,
      external_reference: String(pedido.id),
      transaction_amount: Number(montoDe()),
      metadata: { pedido_id: pedido.id },
    }));
  }

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

  describe("webhook de Mercado Pago aprobado", () => {
    it("confirma el pedido y registra UNA venta con responsable NULL y los montos copiados del pedido", async () => {
      const { pedido, cliente } = await pedidoReal();
      responderMercadoPago(pedido);

      const r = await webhook(81001);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.procesado, true);
      assert.equal(await estadoDe(pedido.id), "CONFIRMADO");
      assert.equal(await ventasDe(pedido.id), 1);
      const venta = await ventaDe(pedido.id);
      assert.equal(venta.estado, "REGISTRADA");
      assert.equal(venta.responsableId, null);
      assert.equal(venta.clienteId, cliente.id);
      assert.equal(venta.metodoPago, "MERCADO_PAGO");
      assert.equal(venta.anuladaEn, null);
      // 2 x 19990 + 12000 de envío
      assert.equal(venta.subtotal.toFixed(2), "39980.00");
      assert.equal(venta.costoEnvio.toFixed(2), "12000.00");
      assert.equal(venta.total.toFixed(2), "51980.00");
      assert.equal(venta.total.toFixed(2), (await pedidoEnBase(pedido.id)).total.toFixed(2));
    });

    it("webhook REPETIDO (mismo pago): 200 sin procesar y sigue habiendo una sola venta, la misma", async () => {
      const { pedido } = await pedidoReal();
      responderMercadoPago(pedido);
      assert.equal((await webhook(81002)).status, 200);
      const primera = await ventaDe(pedido.id);

      const repetido = await webhook(81002);

      assert.equal(repetido.status, 200, JSON.stringify(repetido.body));
      assert.equal(repetido.body.procesado, false);
      assert.equal(await ventasDe(pedido.id), 1);
      assert.equal((await ventaDe(pedido.id)).id, primera.id);
    });

    it("4 webhooks SIMULTÁNEOS del mismo pago: todos 200 y una sola venta", async () => {
      const { pedido } = await pedidoReal();
      responderMercadoPago(pedido);

      const respuestas = await Promise.all([
        webhook(81003),
        webhook(81003),
        webhook(81003),
        webhook(81003),
      ]);

      assert.deepEqual(
        respuestas.map((r) => r.status),
        Array(4).fill(200),
        JSON.stringify(respuestas.map((r) => r.body))
      );
      assert.equal(respuestas.filter((r) => r.body.procesado === true).length, 1);
      assert.equal(await ventasDe(pedido.id), 1);
      assert.equal(await estadoDe(pedido.id), "CONFIRMADO");
    });

    it("PAGO DUPLICADO (otro paymentId aprobado para el mismo pedido): 200 duplicado y la venta no se duplica", async () => {
      const { pedido } = await pedidoReal();
      responderMercadoPago(pedido);
      assert.equal((await webhook(81004)).status, 200);
      const primera = await ventaDe(pedido.id);

      const { resultado: r } = await conLogs(() => webhook(81005));

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.duplicado, true);
      assert.equal(await ventasDe(pedido.id), 1);
      assert.equal((await ventaDe(pedido.id)).id, primera.id);
    });

    it("pago pendiente o rechazado: NO registra venta y el pedido sigue PENDIENTE", async () => {
      for (const [status, paymentId] of [
        ["pending", 81006],
        ["in_process", 81007],
        ["rejected", 81008],
      ]) {
        const { pedido } = await pedidoReal();
        responderMercadoPago(pedido, status);

        const r = await webhook(paymentId);

        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(await ventasDe(pedido.id), 0, status);
        assert.equal(await estadoDe(pedido.id), "PENDIENTE", status);
      }
    });

    it("un rechazo seguido de un pago aprobado (otro intento) registra la venta recién con el aprobado", async () => {
      const { pedido } = await pedidoReal();
      responderMercadoPago(pedido, "rejected");
      assert.equal((await webhook(81009)).status, 200);
      assert.equal(await ventasDe(pedido.id), 0);

      responderMercadoPago(pedido, "approved");
      const r = await webhook(81010);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.procesado, true);
      assert.equal(await ventasDe(pedido.id), 1);
    });

    it("monto que no coincide con el pedido: error y NO registra venta", async () => {
      const { pedido } = await pedidoReal();
      responderMercadoPago(pedido, "approved", () => 1);

      const { resultado: r } = await conLogs(() => webhook(81011));

      assert.ok(r.status >= 400, JSON.stringify(r.body));
      assert.equal(await ventasDe(pedido.id), 0);
      assert.equal(await estadoDe(pedido.id), "PENDIENTE");
    });

    it("pago aprobado sobre un pedido CANCELADO: requiereReembolso y NO se registra venta", async () => {
      const { pedido } = await pedidoReal();
      await prisma.pedido.update({ where: { id: pedido.id }, data: { estado: "CANCELADO" } });
      responderMercadoPago(pedido);

      const { resultado: r } = await conLogs(() => webhook(81012));

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.requiereReembolso, true);
      assert.equal(await estadoDe(pedido.id), "CANCELADO");
      assert.equal((await pagoDe(pedido.id)).estado, "APROBADO");
      assert.equal(await ventasDe(pedido.id), 0);
    });

    it("RN-008: si después cambia el precio del producto, la venta conserva los montos del pedido", async () => {
      const { pedido, variante } = await pedidoReal();
      responderMercadoPago(pedido);
      assert.equal((await webhook(81013)).status, 200);

      await prisma.producto.update({
        where: { id: variante.productoId },
        data: { precio: "1.00" },
      });

      const venta = await ventaDe(pedido.id);
      assert.equal(venta.subtotal.toFixed(2), "39980.00");
      assert.equal(venta.total.toFixed(2), "51980.00");
    });

    it("ATOMICIDAD: si falla el registro de la venta, el webhook responde 500 y NADA queda a medias; el reintento de Mercado Pago lo completa", async () => {
      const { pedido } = await pedidoReal();
      responderMercadoPago(pedido);
      const fallo = new Error("falla simulada al registrar la venta");
      const espia = mock.method(ventaRepository, "crear", () => Promise.reject(fallo));

      let fallido;
      try {
        fallido = (await conLogs(() => webhook(81014))).resultado;
      } finally {
        espia.mock.restore();
      }

      assert.equal(fallido.status, 500, JSON.stringify(fallido.body));
      assert.equal(await estadoDe(pedido.id), "PENDIENTE");
      assert.equal(await pagoDe(pedido.id), null, "el pago NO queda APROBADO sin su venta");
      assert.equal(await ventasDe(pedido.id), 0);

      // Mercado Pago reintenta y ahora se procesa completo.
      const reintento = await webhook(81014);

      assert.equal(reintento.status, 200, JSON.stringify(reintento.body));
      assert.equal(reintento.body.procesado, true);
      assert.equal(await estadoDe(pedido.id), "CONFIRMADO");
      assert.equal((await pagoDe(pedido.id)).estado, "APROBADO");
      assert.equal(await ventasDe(pedido.id), 1);
    });
  });
  describe("cambio manual de estado: PATCH /api/v1/pedidos/:id/estado", () => {
    const cambiarEstado = (pedidoId, estado, usuario = admin) =>
      api("PATCH", `/api/v1/pedidos/${pedidoId}/estado`, { token: usuario.token, body: { estado } });

    // Contra entrega con su pago registrado, listo para que el personal lo confirme.
    async function contraEntregaConPago() {
      const real = await pedidoReal({ metodoPago: "CONTRA_ENTREGA" });
      const registro = await api("POST", "/api/v1/pagos/contra-entrega", {
        token: real.cliente.token,
        body: { pedidoId: real.pedido.id },
      });
      assert.equal(registro.status, 201, JSON.stringify(registro.body));
      return real;
    }

    it("PENDIENTE -> CONFIRMADO de un contra entrega: registra UNA venta con el responsable (admin o vendedor) y los montos del pedido", async () => {
      for (const staff of [admin, vendedor]) {
        const { pedido, cliente } = await contraEntregaConPago();

        const r = await cambiarEstado(pedido.id, "CONFIRMADO", staff);

        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.pedido.estado, "CONFIRMADO");
        assert.equal(await ventasDe(pedido.id), 1);
        const venta = await ventaDe(pedido.id);
        assert.equal(venta.estado, "REGISTRADA");
        assert.equal(venta.responsableId, staff.id);
        assert.equal(venta.clienteId, cliente.id);
        assert.equal(venta.metodoPago, "CONTRA_ENTREGA");
        assert.equal(venta.subtotal.toFixed(2), "39980.00");
        assert.equal(venta.costoEnvio.toFixed(2), "12000.00");
        assert.equal(venta.total.toFixed(2), "51980.00");
      }
    });

    it("la salida del estado legado PAGO_APROBADO -> CONFIRMADO también registra la venta", async () => {
      const cliente = await clienteConDireccion();
      const variante = await crearVariante({ stock: 5 });
      const pedido = await crearPedido({
        usuarioId: cliente.id,
        direccionId: cliente.direccion.id,
        lineas: [{ variante, cantidad: 1, precioUnitario: "25000.00" }],
        costoEnvio: 12000,
        estado: "PAGO_APROBADO",
      });

      const r = await cambiarEstado(pedido.id, "CONFIRMADO", vendedor);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      const venta = await ventaDe(pedido.id);
      assert.equal(venta.responsableId, vendedor.id);
      assert.equal(venta.metodoPago, "MERCADO_PAGO");
      assert.equal(venta.total.toFixed(2), "37000.00");
    });

    it("las transiciones POSTERIORES (EN_PREPARACION ... ENTREGADO) no crean otra venta ni cambian al responsable", async () => {
      const { pedido } = await contraEntregaConPago();
      assert.equal((await cambiarEstado(pedido.id, "CONFIRMADO", admin)).status, 200);
      const primera = await ventaDe(pedido.id);

      for (const estado of ["EN_PREPARACION", "ENVIADO", "EN_TRANSITO", "ENTREGADO"]) {
        const r = await cambiarEstado(pedido.id, estado, vendedor);
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(await ventasDe(pedido.id), 1, estado);
      }

      const final = await ventaDe(pedido.id);
      assert.equal(final.id, primera.id);
      assert.equal(final.responsableId, admin.id);
      assert.equal(final.estado, "REGISTRADA");
    });

    it("si la venta ya existía (p. ej. backfill), confirmar no falla ni la duplica", async () => {
      const cliente = await clienteConDireccion();
      const variante = await crearVariante({ stock: 5 });
      const pedido = await crearPedido({
        usuarioId: cliente.id,
        direccionId: cliente.direccion.id,
        lineas: [{ variante, cantidad: 1 }],
        estado: "PAGO_APROBADO",
      });
      const previa = await prisma.venta.create({
        data: {
          pedidoId: pedido.id,
          clienteId: cliente.id,
          subtotal: pedido.subtotal,
          costoEnvio: pedido.costoEnvio,
          total: pedido.total,
          metodoPago: pedido.metodoPago,
        },
      });

      const r = await cambiarEstado(pedido.id, "CONFIRMADO", admin);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(await ventasDe(pedido.id), 1);
      assert.equal((await ventaDe(pedido.id)).id, previa.id);
    });

    it("transición rechazada o sin permiso: NO registra venta y el estado no cambia", async () => {
      // Mercado Pago pendiente: solo lo confirma el webhook.
      const mp = await pedidoReal();
      assertErrorEstandar(await cambiarEstado(mp.pedido.id, "CONFIRMADO"), 409, "TRANSICION_ESTADO_INVALIDA");

      // Contra entrega SIN su pago registrado.
      const sinPago = await pedidoReal({ metodoPago: "CONTRA_ENTREGA" });
      assertErrorEstandar(
        await cambiarEstado(sinPago.pedido.id, "CONFIRMADO"),
        409,
        "TRANSICION_ESTADO_INVALIDA"
      );

      // El cliente no puede cambiar estados.
      const propio = await contraEntregaConPago();
      assertErrorEstandar(
        await cambiarEstado(propio.pedido.id, "CONFIRMADO", propio.cliente),
        403,
        "ACCESO_DENEGADO"
      );

      for (const { pedido } of [mp, sinPago, propio]) {
        assert.equal(await ventasDe(pedido.id), 0);
        assert.equal(await estadoDe(pedido.id), "PENDIENTE");
      }
    });

    it("5 confirmaciones SIMULTÁNEAS: una gana (200), las otras 409, y hay una sola venta", async () => {
      const { pedido } = await contraEntregaConPago();

      const respuestas = await Promise.all(
        [admin, vendedor, admin, vendedor, admin].map((staff) =>
          cambiarEstado(pedido.id, "CONFIRMADO", staff)
        )
      );

      assert.equal(respuestas.filter((r) => r.status === 200).length, 1, JSON.stringify(respuestas.map((r) => r.body)));
      for (const r of respuestas.filter((r) => r.status !== 200)) {
        assertErrorEstandar(r, 409, "TRANSICION_ESTADO_INVALIDA");
      }
      assert.equal(await ventasDe(pedido.id), 1);
      assert.equal(await estadoDe(pedido.id), "CONFIRMADO");
    });

    it("ATOMICIDAD: si falla el registro de la venta, el estado del pedido NO cambia (500, sin venta)", async () => {
      const { pedido } = await contraEntregaConPago();
      const fallo = new Error("falla simulada al registrar la venta");
      const espia = mock.method(ventaRepository, "crear", () => Promise.reject(fallo));

      let fallido;
      try {
        fallido = (await conLogs(() => cambiarEstado(pedido.id, "CONFIRMADO"))).resultado;
      } finally {
        espia.mock.restore();
      }

      assert.equal(fallido.status, 500, JSON.stringify(fallido.body));
      assert.equal(await estadoDe(pedido.id), "PENDIENTE");
      assert.equal(await ventasDe(pedido.id), 0);

      // Sin la falla, el mismo cambio se completa.
      const r = await cambiarEstado(pedido.id, "CONFIRMADO");
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(await ventasDe(pedido.id), 1);
    });
  });
});
