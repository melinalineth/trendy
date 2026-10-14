// Tests HTTP de la integración con Mercado Pago (RF-034, RF-035, RF-036; RN-009
// eventos de pago idempotentes). NINGÚN test sale a la red: el SDK se mockea a
// nivel de prototipo (Preference.prototype.create y Payment.prototype.get) y,
// por defecto, cualquier llamada no prevista falla con "red prohibida". La
// firma del webhook NO se mockea: se calcula con el mismo HMAC-SHA256 que
// documenta Mercado Pago y la valida el WebhookSignatureValidator real del SDK.
//
// Endpoints:
//   POST /api/v1/pagos/mercadopago/preferencia   (cliente dueño)
//   POST /api/v1/pagos/mercadopago/webhook       (público, validado por firma)
//
// Uso: DATABASE_URL=mysql://... npm test
const { describe, it, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const SECRETO_WEBHOOK = "secreto-webhook-solo-tests";
process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-token-falso-solo-tests";
process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRETO_WEBHOOK;
process.env.MERCADOPAGO_WEBHOOK_URL = "https://trendy.test/api/v1/pagos/mercadopago/webhook";

const mercadopago = require("mercadopago");
const {
  prisma,
  iniciarServidor,
  pedir,
  crearUsuario,
  crearVariante,
  crearDireccion,
  crearPedido,
  limpiar,
} = require("./helpers/entorno");

function assertErrorEstandar(respuesta, status, codigo) {
  assert.equal(respuesta.status, status, JSON.stringify(respuesta.body));
  assert.deepEqual(Object.keys(respuesta.body.error).sort(), ["codigo", "detalles", "mensaje"]);
  assert.equal(respuesta.body.error.codigo, codigo);
}

// x-signature tal como la arma Mercado Pago: "ts=<seg>,v1=<hmac>" con el
// manifiesto "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
function firmar(dataId, requestId, secreto = SECRETO_WEBHOOK) {
  const ts = Math.floor(Date.now() / 1000);
  const manifiesto = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac("sha256", secreto).update(manifiesto).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

describe("Pagos con Mercado Pago (RF-034, RF-035, RF-036)", () => {
  let servidor;
  let api;
  let cliente;
  let otroCliente;
  let admin;
  let vendedor;
  let mockCrearPreferencia;
  let mockObtenerPago;

  const redProhibida = async () => {
    throw new Error("red prohibida en tests: falta mockear esta llamada al SDK");
  };

  async function pedidoDe(usuario, opciones = {}) {
    const direccion = await crearDireccion(usuario.id);
    const variante = opciones.variante ?? (await crearVariante({ stock: 10 }));
    return crearPedido({
      usuarioId: usuario.id,
      direccionId: direccion.id,
      lineas: [{ variante, cantidad: 2, precioUnitario: "19990.50" }],
      costoEnvio: 12000,
      metodoPago: "MERCADO_PAGO",
      ...opciones,
    });
  }

  // Envía un webhook firmado. `pago` es lo que devolverá el Payment.get
  // mockeado (null = no se configura el mock).
  let contadorRequest = 0;
  function webhook(dataId, { firma, body, sinFirma = false } = {}) {
    const requestId = `req-${++contadorRequest}`;
    const headers = { "x-request-id": requestId };
    if (!sinFirma) {
      headers["x-signature"] = firma ?? firmar(String(dataId), requestId);
    }
    return api("POST", "/api/v1/pagos/mercadopago/webhook", {
      headers,
      body: body ?? { type: "payment", action: "payment.updated", data: { id: String(dataId) } },
    });
  }

  function pagoMercadoPago(pedido, { id, status, monto } = {}) {
    return {
      id: Number(id),
      status,
      external_reference: String(pedido.id),
      transaction_amount: monto ?? Number(pedido.total),
      metadata: { pedido_id: pedido.id },
    };
  }

  const pagoEnBase = (pedidoId) => prisma.pago.findUnique({ where: { pedidoId } });
  const estadoPedido = async (id) => (await prisma.pedido.findUnique({ where: { id } })).estado;
  const stockDe = async (id) => (await prisma.variante.findUnique({ where: { id } })).stock;
  const movimientosDe = (varianteId) =>
    prisma.inventarioMovimiento.findMany({ where: { varianteId }, orderBy: { id: "asc" } });

  before(async () => {
    mockCrearPreferencia = mock.method(mercadopago.Preference.prototype, "create", redProhibida);
    mockObtenerPago = mock.method(mercadopago.Payment.prototype, "get", redProhibida);

    servidor = await iniciarServidor();
    api = (metodo, ruta, opciones) => pedir(servidor.baseUrl, metodo, ruta, opciones);
    cliente = await crearUsuario("cliente");
    otroCliente = await crearUsuario("cliente");
    admin = await crearUsuario("admin");
    vendedor = await crearUsuario("vendedor");
  });

  beforeEach(() => {
    mockCrearPreferencia.mock.mockImplementation(redProhibida);
    mockCrearPreferencia.mock.resetCalls();
    mockObtenerPago.mock.mockImplementation(redProhibida);
    mockObtenerPago.mock.resetCalls();
  });

  after(async () => {
    mock.restoreAll();
    await servidor.cerrar();
    await limpiar();
  });

  describe("POST /api/v1/pagos/mercadopago/preferencia", () => {
    const ruta = "/api/v1/pagos/mercadopago/preferencia";

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

    it("crea la preferencia con las líneas del pedido + envío: suma = total, referencia externa = pedido", async () => {
      const pedido = await pedidoDe(cliente);
      mockCrearPreferencia.mock.mockImplementation(async () => ({
        id: "pref-123",
        init_point: "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=pref-123",
      }));

      const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body, {
        pedidoId: pedido.id,
        preferenciaId: "pref-123",
        checkoutUrl: "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=pref-123",
      });

      assert.equal(mockCrearPreferencia.mock.callCount(), 1);
      const { body } = mockCrearPreferencia.mock.calls[0].arguments[0];
      assert.equal(body.external_reference, String(pedido.id));
      assert.equal(body.metadata.pedido_id, pedido.id);
      assert.equal(body.notification_url, process.env.MERCADOPAGO_WEBHOOK_URL);

      const total = body.items.reduce((suma, i) => suma + i.unit_price * i.quantity, 0);
      // 2 x 19990.50 + 12000 de envío: si el envío no viaja, Mercado Pago
      // cobraría menos que Pedido.total y el webhook rechazaría el pago.
      assert.equal(total, Number(pedido.total));
      assert.equal(total, 51981);
      for (const item of body.items) {
        assert.equal(item.currency_id, "COP");
      }
      assert.ok(body.items.some((i) => /env[ií]o/i.test(i.title) && i.unit_price === 12000));
    });

    it("un monto enviado por el cliente se rechaza (400): el body solo acepta pedidoId", async () => {
      const pedido = await pedidoDe(cliente);

      const r = await api("POST", ruta, {
        token: cliente.token,
        body: { pedidoId: pedido.id, monto: 1 },
      });

      assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
      assert.equal(mockCrearPreferencia.mock.callCount(), 0);
    });

    it("pedido de OTRO cliente -> 404 PEDIDO_NO_ENCONTRADO y no se llama a Mercado Pago", async () => {
      const ajeno = await pedidoDe(otroCliente);

      const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: ajeno.id } });

      assertErrorEstandar(r, 404, "PEDIDO_NO_ENCONTRADO");
      assert.equal(mockCrearPreferencia.mock.callCount(), 0);
    });

    it("pedido que ya no está PENDIENTE -> 409 PEDIDO_NO_PENDIENTE", async () => {
      const pedido = await pedidoDe(cliente, { estado: "CONFIRMADO" });

      const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });

      assertErrorEstandar(r, 409, "PEDIDO_NO_PENDIENTE");
      assert.equal(mockCrearPreferencia.mock.callCount(), 0);
    });

    it("pedido creado para contra entrega -> 409 METODO_PAGO_NO_COINCIDE", async () => {
      const pedido = await pedidoDe(cliente, { metodoPago: "CONTRA_ENTREGA" });

      const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });

      assertErrorEstandar(r, 409, "METODO_PAGO_NO_COINCIDE");
      assert.equal(mockCrearPreferencia.mock.callCount(), 0);
    });

    it("si Mercado Pago falla (p. ej. token inválido, 401 del SDK) -> 502 PASARELA_NO_DISPONIBLE, sin filtrar el 401", async () => {
      const pedido = await pedidoDe(cliente);
      mockCrearPreferencia.mock.mockImplementation(async () => {
        throw new mercadopago.MPAuthenticationError({ status: 401, message: "invalid access token" });
      });

      const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });

      assertErrorEstandar(r, 502, "PASARELA_NO_DISPONIBLE");
    });

    it("si Mercado Pago no devuelve init_point -> 502 PASARELA_NO_DISPONIBLE", async () => {
      const pedido = await pedidoDe(cliente);
      mockCrearPreferencia.mock.mockImplementation(async () => ({ id: "pref-sin-url" }));

      const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });

      assertErrorEstandar(r, 502, "PASARELA_NO_DISPONIBLE");
    });

    describe("body inválido -> 400 VALIDACION_FALLIDA con detalles", () => {
      for (const [nombre, body] of [
        ["vacío", {}],
        ["pedidoId string", { pedidoId: "abc" }],
        ["pedidoId negativo", { pedidoId: -1 }],
        ["pedidoId decimal", { pedidoId: 2.5 }],
      ]) {
        it(nombre, async () => {
          const r = await api("POST", ruta, { token: cliente.token, body });
          assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
          assert.ok(r.body.error.detalles.length > 0);
        });
      }
    });
  });

  describe("POST /api/v1/pagos/mercadopago/webhook", () => {
    it("pago APROBADO: Pago APROBADO, Pedido CONFIRMADO y NO se toca el inventario", async () => {
      const variante = await crearVariante({ stock: 8 });
      const pedido = await pedidoDe(cliente, { variante });
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "approved" })
      );

      const r = await webhook(9001);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.procesado, true);
      // El estado se consulta a Mercado Pago, no se confía en el body.
      assert.deepEqual(mockObtenerPago.mock.calls[0].arguments[0], { id: "9001" });

      const pago = await pagoEnBase(pedido.id);
      assert.equal(pago.metodo, "MERCADO_PAGO");
      assert.equal(pago.estado, "APROBADO");
      assert.equal(pago.referenciaExterna, "9001");
      assert.equal(Number(pago.monto), Number(pedido.total));
      assert.equal(await estadoPedido(pedido.id), "CONFIRMADO");
      // El stock se descontó al crear el pedido (Fase B): acá no se toca.
      assert.equal(await stockDe(variante.id), 8);
      assert.equal((await movimientosDe(variante.id)).length, 0);
    });

    it("evento APROBADO repetido (RN-009): 200, no duplica ni modifica nada", async () => {
      const variante = await crearVariante({ stock: 8 });
      const pedido = await pedidoDe(cliente, { variante });
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "approved" })
      );

      assert.equal((await webhook(9002)).status, 200);
      const pagoTrasPrimero = await pagoEnBase(pedido.id);

      const r = await webhook(9002);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.procesado, false);
      assert.equal(await prisma.pago.count({ where: { pedidoId: pedido.id } }), 1);
      assert.deepEqual(await pagoEnBase(pedido.id), pagoTrasPrimero);
      assert.equal(await estadoPedido(pedido.id), "CONFIRMADO");
      assert.equal(await stockDe(variante.id), 8);
    });

    it("pago RECHAZADO: Pago RECHAZADO, Pedido PAGO_RECHAZADO y se repone el stock descontado", async () => {
      // Stock 3 = ya descontadas las 2 unidades del pedido al crearlo.
      const variante = await crearVariante({ stock: 3 });
      const pedido = await pedidoDe(cliente, { variante });
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "rejected" })
      );

      const r = await webhook(9003);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.procesado, true);
      assert.equal((await pagoEnBase(pedido.id)).estado, "RECHAZADO");
      assert.equal(await estadoPedido(pedido.id), "PAGO_RECHAZADO");
      assert.equal(await stockDe(variante.id), 5);

      const movimientos = await movimientosDe(variante.id);
      assert.equal(movimientos.length, 1);
      assert.equal(movimientos[0].tipoAjuste, "ENTRADA");
      assert.equal(movimientos[0].cantidad, 2);
      assert.equal(movimientos[0].motivo, `Pedido rechazado (pedido #${pedido.id})`);
      assert.equal(movimientos[0].usuarioId, cliente.id);
    });

    it("evento RECHAZADO repetido (RN-009): no repone el stock dos veces", async () => {
      const variante = await crearVariante({ stock: 3 });
      const pedido = await pedidoDe(cliente, { variante });
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "rejected" })
      );

      assert.equal((await webhook(9004)).status, 200);
      const r = await webhook(9004);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.procesado, false);
      assert.equal(await stockDe(variante.id), 5);
      assert.equal((await movimientosDe(variante.id)).length, 1);
    });

    it("eventos RECHAZADO repetidos SIMULTÁNEOS: el stock se repone una sola vez", async () => {
      const variante = await crearVariante({ stock: 3 });
      const pedido = await pedidoDe(cliente, { variante });
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "rejected" })
      );

      const respuestas = await Promise.all(Array.from({ length: 6 }, () => webhook(9005)));

      assert.deepEqual(
        respuestas.map((r) => r.status),
        Array(6).fill(200),
        JSON.stringify(respuestas.map((r) => r.body))
      );
      assert.equal(respuestas.filter((r) => r.body.procesado === true).length, 1);
      assert.equal(await stockDe(variante.id), 5);
      assert.equal((await movimientosDe(variante.id)).length, 1);
      assert.equal(await prisma.pago.count({ where: { pedidoId: pedido.id } }), 1);
    });

    it("pago pendiente / en proceso: 200 sin cambiar el pedido (RF-035)", async () => {
      const pedido = await pedidoDe(cliente);
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "in_process" })
      );

      const r = await webhook(9006);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.procesado, false);
      assert.equal(await pagoEnBase(pedido.id), null);
      assert.equal(await estadoPedido(pedido.id), "PENDIENTE");
    });

    it("el monto pagado no coincide con el total -> 409 MONTO_NO_COINCIDE, nada cambia", async () => {
      const pedido = await pedidoDe(cliente);
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "approved", monto: 100 })
      );

      const r = await webhook(9007);

      assertErrorEstandar(r, 409, "MONTO_NO_COINCIDE");
      assert.equal(await pagoEnBase(pedido.id), null);
      assert.equal(await estadoPedido(pedido.id), "PENDIENTE");
    });

    it("pago desconocido: su referencia externa no es un pedido nuestro -> 404, nada cambia", async () => {
      mockObtenerPago.mock.mockImplementation(async ({ id }) => ({
        id: Number(id),
        status: "approved",
        external_reference: "2147483000",
        transaction_amount: 1000,
      }));

      const r = await webhook(9008);

      assertErrorEstandar(r, 404, "PEDIDO_NO_ENCONTRADO");
    });

    it("pago desconocido para Mercado Pago (404 del SDK) -> 404 PAGO_NO_ENCONTRADO", async () => {
      mockObtenerPago.mock.mockImplementation(async () => {
        throw new mercadopago.MPNotFoundError({ status: 404, message: "Payment not found" });
      });

      const r = await webhook(9009);

      assertErrorEstandar(r, 404, "PAGO_NO_ENCONTRADO");
    });

    it("Mercado Pago caído (error 5xx del SDK) -> 502 PASARELA_NO_DISPONIBLE", async () => {
      mockObtenerPago.mock.mockImplementation(async () => {
        throw new mercadopago.MPServerError({ status: 503, message: "unavailable" });
      });

      const r = await webhook(9010);

      assertErrorEstandar(r, 502, "PASARELA_NO_DISPONIBLE");
    });

    it("sin x-signature -> 401 FIRMA_WEBHOOK_INVALIDA y no se consulta a Mercado Pago", async () => {
      const r = await webhook(9011, { sinFirma: true });

      assertErrorEstandar(r, 401, "FIRMA_WEBHOOK_INVALIDA");
      assert.equal(mockObtenerPago.mock.callCount(), 0);
    });

    it("firma calculada con otro secreto -> 401 y el pedido no cambia (RF-036)", async () => {
      const pedido = await pedidoDe(cliente);
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "approved" })
      );

      const r = await webhook(9012, { firma: firmar("9012", "otro-request", "secreto-falso") });

      assertErrorEstandar(r, 401, "FIRMA_WEBHOOK_INVALIDA");
      assert.equal(mockObtenerPago.mock.callCount(), 0);
      assert.equal(await estadoPedido(pedido.id), "PENDIENTE");
    });

    it("firma válida para OTRO data.id (replay sobre otro pago) -> 401", async () => {
      const requestId = "req-replay";
      const r = await api("POST", "/api/v1/pagos/mercadopago/webhook", {
        headers: { "x-request-id": requestId, "x-signature": firmar("1111", requestId) },
        body: { type: "payment", data: { id: "2222" } },
      });

      assertErrorEstandar(r, 401, "FIRMA_WEBHOOK_INVALIDA");
      assert.equal(mockObtenerPago.mock.callCount(), 0);
    });

    it("notificación de otro tipo (no 'payment') con firma válida -> 200 sin procesar", async () => {
      const r = await webhook(9013, { body: { type: "merchant_order", data: { id: "9013" } } });

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.procesado, false);
      assert.equal(mockObtenerPago.mock.callCount(), 0);
    });

    describe("payload malformado -> 400 VALIDACION_FALLIDA con detalles", () => {
      for (const [nombre, body] of [
        ["sin type", { data: { id: "1" } }],
        ["type payment sin data.id", { type: "payment" }],
        ["type payment con data.id vacío", { type: "payment", data: { id: "  " } }],
        ["body array", [{ type: "payment" }]],
      ]) {
        it(nombre, async () => {
          const r = await webhook(1, { body });
          assertErrorEstandar(r, 400, "VALIDACION_FALLIDA");
          assert.ok(r.body.error.detalles.length > 0);
          assert.equal(mockObtenerPago.mock.callCount(), 0);
        });
      }
    });

    it("sin MERCADOPAGO_WEBHOOK_SECRET configurado -> 500 (error de configuración, no 200)", async () => {
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
      try {
        const r = await webhook(9014);
        assertErrorEstandar(r, 500, "ERROR_INTERNO");
      } finally {
        process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRETO_WEBHOOK;
      }
    });
  });
});
