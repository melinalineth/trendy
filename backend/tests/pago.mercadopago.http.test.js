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
const pedidoRepository = require("../src/repositories/pedido.repository");
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
// manifiesto "id:<data.id>;request-id:<x-request-id>;ts:<ts>;". `ts` en
// SEGUNDOS, por defecto el actual (el service tolera 5 minutos de desfase).
function firmar(
  dataId,
  requestId,
  secreto = SECRETO_WEBHOOK,
  ts = Math.floor(Date.now() / 1000)
) {
  const manifiesto = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac("sha256", secreto).update(manifiesto).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

// Ejecuta `fn` capturando console.error; devuelve { resultado, lineas } con
// cada llamada unida en una sola línea de texto.
async function conLogs(fn) {
  const mockLog = mock.method(console, "error", () => {});
  try {
    const resultado = await fn();
    return { resultado, lineas: mockLog.mock.calls.map((c) => c.arguments.join(" ")) };
  } finally {
    mockLog.mock.restore();
  }
}

// Ningún log puede contener el secret del webhook, el access token ni el
// header x-signature (ni su hash).
function assertLogsSinSecretos(lineas, firma) {
  const hash = firma.split("v1=")[1];
  for (const linea of lineas) {
    assert.ok(!linea.includes(SECRETO_WEBHOOK), "el log incluye el secret");
    assert.ok(!linea.includes(process.env.MERCADOPAGO_ACCESS_TOKEN), "el log incluye el token");
    assert.ok(!linea.includes(firma) && !linea.includes(hash), "el log incluye la firma");
  }
}

// Busca el log estructurado de `evento`: exige que sea JSON de UNA línea y
// devuelve el objeto parseado.
function logDe(lineas, evento) {
  const linea = lineas.find((l) => l.includes(`"evento":"${evento}"`));
  assert.ok(linea, `no se logueó ${evento}: ${JSON.stringify(lineas)}`);
  assert.ok(!linea.includes("\n"), "el log debe ser de una sola línea");
  return JSON.parse(linea);
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

    describe("expiración de la preferencia (MERCADOPAGO_PREFERENCIA_HORAS)", () => {
      const HORA_MS = 60 * 60 * 1000;
      const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;

      // Crea una preferencia con la variable en `valor` (undefined = sin
      // definir) y devuelve el body que recibió el SDK + el instante del envío.
      async function preferenciaCon(valor) {
        const anterior = process.env.MERCADOPAGO_PREFERENCIA_HORAS;
        if (valor === undefined) delete process.env.MERCADOPAGO_PREFERENCIA_HORAS;
        else process.env.MERCADOPAGO_PREFERENCIA_HORAS = valor;

        try {
          const pedido = await pedidoDe(cliente);
          mockCrearPreferencia.mock.resetCalls();
          mockCrearPreferencia.mock.mockImplementation(async () => ({
            id: "pref-exp",
            init_point: "https://mp.test/pref-exp",
          }));
          const antes = Date.now();
          const r = await api("POST", ruta, {
            token: cliente.token,
            body: { pedidoId: pedido.id },
          });
          const despues = Date.now();
          assert.equal(r.status, 200, JSON.stringify(r.body));
          const { creadoEn } = await prisma.pedido.findUnique({ where: { id: pedido.id } });
          return {
            body: mockCrearPreferencia.mock.calls[0].arguments[0].body,
            antes,
            despues,
            creadoEn,
          };
        } finally {
          if (anterior === undefined) delete process.env.MERCADOPAGO_PREFERENCIA_HORAS;
          else process.env.MERCADOPAGO_PREFERENCIA_HORAS = anterior;
        }
      }

      const MARGEN_RELOJ_MS = 60 * 1000;

      // Ventana: desde = ahora - 60 s (margen por reloj adelantado respecto de
      // Mercado Pago), hasta = el menor entre ahora + N horas y
      // Pedido.creadoEn + N horas (la preferencia nunca sobrevive al
      // vencimiento del pedido), y date_of_expiration = hasta (un pago en
      // efectivo/ticket no se acredita después del vencimiento). Para un
      // pedido recién creado, creadoEn <= ahora: hasta = creadoEn + N horas.
      function assertVentana({ body, antes, despues, creadoEn }, horas) {
        assert.equal(body.expires, true);
        assert.match(body.expiration_date_from, ISO_8601);
        assert.match(body.expiration_date_to, ISO_8601);
        assert.match(body.date_of_expiration, ISO_8601);
        assert.equal(body.date_of_expiration, body.expiration_date_to);
        const desde = Date.parse(body.expiration_date_from);
        const hasta = Date.parse(body.expiration_date_to);
        // Tolerancia de 1 s por el redondeo a ms y el tiempo del request.
        assert.ok(
          desde >= antes - MARGEN_RELOJ_MS - 1000 && desde <= despues - MARGEN_RELOJ_MS + 1000,
          body.expiration_date_from
        );
        assert.ok(hasta <= despues + horas * HORA_MS, body.expiration_date_to);
        assert.equal(hasta, creadoEn.getTime() + horas * HORA_MS);
      }

      it("pedido casi vencido: la preferencia vence con el pedido (creadoEn + horas), no a las 24 h de ahora", async () => {
        const anterior = process.env.MERCADOPAGO_PREFERENCIA_HORAS;
        delete process.env.MERCADOPAGO_PREFERENCIA_HORAS;
        try {
          const creadoEn = new Date(Date.now() - 23 * HORA_MS);
          const pedido = await pedidoDe(cliente, { creadoEn });
          mockCrearPreferencia.mock.mockImplementation(async () => ({
            id: "pref-casi",
            init_point: "https://mp.test/pref-casi",
          }));

          const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });

          assert.equal(r.status, 200, JSON.stringify(r.body));
          const { body } = mockCrearPreferencia.mock.calls.at(-1).arguments[0];
          const limite = new Date(pedido.creadoEn).getTime() + 24 * HORA_MS;
          assert.ok(Date.parse(body.expiration_date_to) <= limite, body.expiration_date_to);
          assert.equal(Date.parse(body.expiration_date_to), limite);
          assert.equal(body.date_of_expiration, body.expiration_date_to);
        } finally {
          if (anterior !== undefined) process.env.MERCADOPAGO_PREFERENCIA_HORAS = anterior;
        }
      });

      it("pedido ya vencido (creadoEn + horas <= ahora) -> 409 PEDIDO_VENCIDO y NO se llama a Mercado Pago", async () => {
        const anterior = process.env.MERCADOPAGO_PREFERENCIA_HORAS;
        process.env.MERCADOPAGO_PREFERENCIA_HORAS = "2";
        try {
          const pedido = await pedidoDe(cliente, { creadoEn: new Date(Date.now() - 2 * HORA_MS - 1000) });

          const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });

          assertErrorEstandar(r, 409, "PEDIDO_VENCIDO");
          assert.equal(mockCrearPreferencia.mock.callCount(), 0);
        } finally {
          if (anterior === undefined) delete process.env.MERCADOPAGO_PREFERENCIA_HORAS;
          else process.env.MERCADOPAGO_PREFERENCIA_HORAS = anterior;
        }
      });

      it("sin la variable: expira a las 24 horas", async () => {
        assertVentana(await preferenciaCon(undefined), 24);
      });

      it("MERCADOPAGO_PREFERENCIA_HORAS=48: expira a las 48 horas (y 1 y 168 son válidos)", async () => {
        assertVentana(await preferenciaCon("48"), 48);
        assertVentana(await preferenciaCon("1"), 1);
        assertVentana(await preferenciaCon("168"), 168);
      });

      it("espacios alrededor se toleran: ' 12 ' -> 12 horas", async () => {
        assertVentana(await preferenciaCon(" 12 "), 12);
      });

      for (const invalido of ["0", "169", "-5", "2.5", "abc", "", " 12x", "1e2", "0x10"]) {
        it(`MERCADOPAGO_PREFERENCIA_HORAS=${JSON.stringify(invalido)} inválida -> default 24 horas`, async () => {
          assertVentana(await preferenciaCon(invalido), 24);
        });
      }
    });

    it("solo un pedido PENDIENTE es pagable: PAGO_RECHAZADO / PAGO_PENDIENTE -> 409 PEDIDO_NO_PENDIENTE", async () => {
      for (const estado of ["PAGO_RECHAZADO", "PAGO_PENDIENTE"]) {
        const pedido = await pedidoDe(cliente, { estado });

        const r = await api("POST", ruta, {
          token: cliente.token,
          body: { pedidoId: pedido.id },
        });

        assertErrorEstandar(r, 409, "PEDIDO_NO_PENDIENTE");
      }
      assert.equal(mockCrearPreferencia.mock.callCount(), 0);
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

    it("líneas + envío que no suman Pedido.total -> 409 TOTAL_INCONSISTENTE y NO se llama a Mercado Pago", async () => {
      const pedido = await pedidoDe(cliente);
      // Un centavo de diferencia alcanza: se compara en centavos.
      await prisma.pedido.update({
        where: { id: pedido.id },
        data: { total: (Number(pedido.total) + 0.01).toFixed(2) },
      });

      const r = await api("POST", ruta, { token: cliente.token, body: { pedidoId: pedido.id } });

      assertErrorEstandar(r, 409, "TOTAL_INCONSISTENTE");
      assert.equal(mockCrearPreferencia.mock.callCount(), 0);
    });

    it("sin MERCADOPAGO_ACCESS_TOKEN -> 503 CONFIGURACION_PAGOS_INCOMPLETA con mensaje genérico (sin nombrar la variable)", async () => {
      const pedido = await pedidoDe(cliente);
      const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
      const mockLog = mock.method(console, "error", () => {});
      delete process.env.MERCADOPAGO_ACCESS_TOKEN;

      try {
        const r = await api("POST", ruta, {
          token: cliente.token,
          body: { pedidoId: pedido.id },
        });

        assertErrorEstandar(r, 503, "CONFIGURACION_PAGOS_INCOMPLETA");
        assert.equal(r.body.error.mensaje, "El servicio de pagos no está disponible");
        assert.equal(mockCrearPreferencia.mock.callCount(), 0);
        // El log del servidor sí dice QUÉ falta (solo el nombre).
        assert.ok(
          mockLog.mock.calls.some((c) => c.arguments.join(" ").includes("MERCADOPAGO_ACCESS_TOKEN"))
        );
      } finally {
        process.env.MERCADOPAGO_ACCESS_TOKEN = token;
        mockLog.mock.restore();
      }
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

    // Política de negocio: un rechazo NO es final. Se registra el intento, el
    // pedido sigue pagable y el stock queda retenido (no se repone) hasta que
    // el pedido se cancele (Fase B).
    it("pago RECHAZADO: registra el intento, el pedido sigue PENDIENTE y el stock NO se repone", async () => {
      // Stock 3 = ya descontadas las 2 unidades del pedido al crearlo.
      const variante = await crearVariante({ stock: 3 });
      const pedido = await pedidoDe(cliente, { variante });
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "rejected" })
      );

      const r = await webhook(9003);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.procesado, true);
      const pago = await pagoEnBase(pedido.id);
      assert.equal(pago.estado, "RECHAZADO");
      assert.equal(pago.metodo, "MERCADO_PAGO");
      assert.equal(pago.referenciaExterna, "9003");
      assert.equal(await estadoPedido(pedido.id), "PENDIENTE");
      assert.equal(await stockDe(variante.id), 3);
      assert.equal((await movimientosDe(variante.id)).length, 0);
    });

    it("evento RECHAZADO repetido (mismo paymentId, RN-009): 200 procesado:false, sin cambios", async () => {
      const variante = await crearVariante({ stock: 3 });
      const pedido = await pedidoDe(cliente, { variante });
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "rejected" })
      );

      assert.equal((await webhook(9004)).status, 200);
      const pagoTrasPrimero = await pagoEnBase(pedido.id);
      const r = await webhook(9004);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.procesado, false);
      assert.deepEqual(await pagoEnBase(pedido.id), pagoTrasPrimero);
      assert.equal(await estadoPedido(pedido.id), "PENDIENTE");
      assert.equal(await stockDe(variante.id), 3);
      assert.equal((await movimientosDe(variante.id)).length, 0);
    });

    it("eventos RECHAZADO repetidos SIMULTÁNEOS: un solo registro, stock intacto", async () => {
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
      assert.equal(await prisma.pago.count({ where: { pedidoId: pedido.id } }), 1);
      assert.equal(await estadoPedido(pedido.id), "PENDIENTE");
      assert.equal(await stockDe(variante.id), 3);
      assert.equal((await movimientosDe(variante.id)).length, 0);
    });

    it("un segundo intento RECHAZADO (otro paymentId) actualiza la referencia del intento", async () => {
      const pedido = await pedidoDe(cliente);
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "rejected" })
      );

      assert.equal((await webhook(9006)).status, 200);
      const r = await webhook(9007);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.procesado, true);
      const pago = await pagoEnBase(pedido.id);
      assert.equal(pago.estado, "RECHAZADO");
      assert.equal(pago.referenciaExterna, "9007");
      assert.equal(await prisma.pago.count({ where: { pedidoId: pedido.id } }), 1);
      assert.equal(await estadoPedido(pedido.id), "PENDIENTE");
    });

    it("RECHAZADO y después APROBADO (reintento con otro paymentId): pedido CONFIRMADO, Pago APROBADO, stock intacto", async () => {
      const variante = await crearVariante({ stock: 3 });
      const pedido = await pedidoDe(cliente, { variante });
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: id === "9008" ? "rejected" : "approved" })
      );

      assert.equal((await webhook(9008)).status, 200);
      assert.equal((await pagoEnBase(pedido.id)).estado, "RECHAZADO");

      const r = await webhook(9009);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.procesado, true);
      const pago = await pagoEnBase(pedido.id);
      assert.equal(pago.estado, "APROBADO");
      assert.equal(pago.referenciaExterna, "9009");
      assert.equal(await prisma.pago.count({ where: { pedidoId: pedido.id } }), 1);
      assert.equal(await estadoPedido(pedido.id), "CONFIRMADO");
      // Ni repuesto por el rechazo ni re-descontado por la aprobación.
      assert.equal(await stockDe(variante.id), 3);
      assert.equal((await movimientosDe(variante.id)).length, 0);
    });

    it("APROBADO y RECHAZADO SIMULTÁNEOS sobre el mismo pedido: el resultado final es siempre aprobado", async () => {
      for (let ronda = 0; ronda < 4; ronda++) {
        const variante = await crearVariante({ stock: 3 });
        const pedido = await pedidoDe(cliente, { variante });
        const aprobado = String(9400 + ronda * 10);
        mockObtenerPago.mock.mockImplementation(async ({ id }) =>
          pagoMercadoPago(pedido, { id, status: id === aprobado ? "approved" : "rejected" })
        );

        // El aprobado en distintas posiciones entre varios rechazos.
        const ids = [1, 2, 3].map((i) => String(Number(aprobado) + i));
        ids.splice(ronda % 4, 0, aprobado);
        const respuestas = await Promise.all(ids.map((id) => webhook(id)));

        assert.deepEqual(
          respuestas.map((r) => r.status),
          Array(ids.length).fill(200),
          JSON.stringify(respuestas.map((r) => r.body))
        );
        const pago = await pagoEnBase(pedido.id);
        assert.equal(pago.estado, "APROBADO");
        assert.equal(pago.referenciaExterna, aprobado);
        assert.equal(await estadoPedido(pedido.id), "CONFIRMADO");
        assert.equal(await stockDe(variante.id), 3);
        assert.equal((await movimientosDe(variante.id)).length, 0);
      }
    });

    // Solo PENDIENTE es pagable (los estados legados PAGO_RECHAZADO /
    // PAGO_PENDIENTE no: el flujo viejo ya había repuesto su stock y aprobarlos
    // generaría sobreventa). Un approved que no se puede aplicar es dinero
    // cobrado sin pedido confirmado: 409 + log PAGO_APROBADO_NO_APLICADO.
    const NO_PAGABLES = [
      "PAGO_RECHAZADO",
      "PAGO_PENDIENTE",
      "PAGO_APROBADO",
      "CONFIRMADO",
      "EN_PREPARACION",
      "ENVIADO",
      "EN_TRANSITO",
      "ENTREGADO",
    ];

    it("approved sobre un pedido NO pagable sin Pago APROBADO -> 409 PEDIDO_NO_PENDIENTE, el pedido no cambia (no retrocede) y queda log", async () => {
      let id = 9700;
      for (const estado of NO_PAGABLES) {
        const variante = await crearVariante({ stock: 3 });
        const pedido = await pedidoDe(cliente, { variante, estado });
        mockObtenerPago.mock.mockImplementation(async ({ id: pid }) =>
          pagoMercadoPago(pedido, { id: pid, status: "approved" })
        );
        const paymentId = String(++id);

        const { resultado: r, lineas } = await conLogs(() => webhook(paymentId));

        assertErrorEstandar(r, 409, "PEDIDO_NO_PENDIENTE");
        assert.equal(await estadoPedido(pedido.id), estado, `el pedido ${estado} cambió de estado`);
        assert.equal(await pagoEnBase(pedido.id), null);
        assert.equal(await stockDe(variante.id), 3);
        assert.deepEqual(logDe(lineas, "PAGO_APROBADO_NO_APLICADO"), {
          evento: "PAGO_APROBADO_NO_APLICADO",
          motivo: "PEDIDO_NO_PENDIENTE",
          pedidoId: pedido.id,
          paymentId,
          montoMp: Number(pedido.total),
          totalPedido: Number(pedido.total),
        });
      }
    });

    it("rejected sobre un pedido NO pagable -> 409 PEDIDO_NO_PENDIENTE, sin Pago ni cambios", async () => {
      let id = 9750;
      for (const estado of NO_PAGABLES) {
        const variante = await crearVariante({ stock: 3 });
        const pedido = await pedidoDe(cliente, { variante, estado });
        mockObtenerPago.mock.mockImplementation(async ({ id: pid }) =>
          pagoMercadoPago(pedido, { id: pid, status: "rejected" })
        );

        const r = await webhook(++id);

        assertErrorEstandar(r, 409, "PEDIDO_NO_PENDIENTE");
        assert.equal(await estadoPedido(pedido.id), estado);
        assert.equal(await pagoEnBase(pedido.id), null);
        assert.equal(await stockDe(variante.id), 3);
        assert.equal((await movimientosDe(variante.id)).length, 0);
      }
    });

    // Reembolsos y contracargos sobre un pago ya aprobado: en esta fase NO se
    // cambia ni el pedido ni el pago (revocar un pedido confirmado requiere una
    // política nueva), pero quedan visibles en el log para gestionarlos.
    for (const [estadoMp, paymentId] of [
      ["refunded", "9801"],
      ["charged_back", "9802"],
    ]) {
      it(`${estadoMp} sobre un pedido CONFIRMADO con Pago APROBADO: 200 revertido, log PAGO_REVERTIDO_MP y nada cambia`, async () => {
        const variante = await crearVariante({ stock: 3 });
        const pedido = await pedidoDe(cliente, { variante });
        mockObtenerPago.mock.mockImplementation(async ({ id }) =>
          pagoMercadoPago(pedido, { id, status: "approved" })
        );
        assert.equal((await webhook(paymentId)).status, 200);
        const pagoAprobado = await pagoEnBase(pedido.id);
        assert.equal(pagoAprobado.estado, "APROBADO");

        mockObtenerPago.mock.mockImplementation(async ({ id }) =>
          pagoMercadoPago(pedido, { id, status: estadoMp })
        );
        const { resultado: r, lineas } = await conLogs(() => webhook(paymentId));

        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.deepEqual(r.body, { recibido: true, procesado: false, revertido: true });
        assert.deepEqual(logDe(lineas, "PAGO_REVERTIDO_MP"), {
          evento: "PAGO_REVERTIDO_MP",
          pedidoId: pedido.id,
          paymentId,
          estadoMp,
          monto: Number(pedido.total),
        });
        assert.deepEqual(await pagoEnBase(pedido.id), pagoAprobado);
        assert.equal(await estadoPedido(pedido.id), "CONFIRMADO");
        assert.equal(await stockDe(variante.id), 3);
        assert.equal((await movimientosDe(variante.id)).length, 0);
      });
    }

    for (const estadoMp of ["cancelled", "pending", "in_process"]) {
      it(`${estadoMp} sobre un Pago ya APROBADO: 200 procesado:false, sin cambios`, async () => {
        const pedido = await pedidoDe(cliente);
        mockObtenerPago.mock.mockImplementation(async ({ id }) =>
          pagoMercadoPago(pedido, { id, status: "approved" })
        );
        assert.equal((await webhook(9850)).status, 200);
        const pagoAprobado = await pagoEnBase(pedido.id);

        mockObtenerPago.mock.mockImplementation(async ({ id }) =>
          pagoMercadoPago(pedido, { id, status: estadoMp })
        );
        const r = await webhook(9850);

        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.procesado, false);
        assert.deepEqual(await pagoEnBase(pedido.id), pagoAprobado);
        assert.equal(await estadoPedido(pedido.id), "CONFIRMADO");
      });
    }

    it("APROBADO sobre un pedido CANCELADO: 200 requiereReembolso, Pago APROBADO, pedido sigue CANCELADO y log estructurado", async () => {
      const variante = await crearVariante({ stock: 3 });
      const pedido = await pedidoDe(cliente, { variante, estado: "CANCELADO" });
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "approved" })
      );

      const mockLog = mock.method(console, "error", () => {});
      let r;
      try {
        r = await webhook(9601);
      } finally {
        mockLog.mock.restore();
      }

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body, { recibido: true, procesado: false, requiereReembolso: true });
      const pago = await pagoEnBase(pedido.id);
      assert.equal(pago.estado, "APROBADO");
      assert.equal(pago.metodo, "MERCADO_PAGO");
      assert.equal(pago.referenciaExterna, "9601");
      assert.equal(Number(pago.monto), Number(pedido.total));
      assert.equal(await estadoPedido(pedido.id), "CANCELADO");
      assert.equal(await stockDe(variante.id), 3);
      assert.equal((await movimientosDe(variante.id)).length, 0);

      const lineas = mockLog.mock.calls.map((c) => c.arguments.join(" "));
      const linea = lineas.find((l) => l.includes("PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO"));
      assert.ok(linea, `no se logueó el evento: ${JSON.stringify(lineas)}`);
      assert.ok(!linea.includes("\n"));
      assert.deepEqual(JSON.parse(linea), {
        evento: "PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO",
        pedidoId: pedido.id,
        paymentId: "9601",
        monto: Number(pedido.total),
      });
      assert.ok(!linea.includes(process.env.MERCADOPAGO_ACCESS_TOKEN));
    });

    it("APROBADO sobre CANCELADO después de un intento RECHAZADO: el Pago pasa a APROBADO, el pedido no cambia", async () => {
      const pedido = await pedidoDe(cliente);
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: id === "9602" ? "rejected" : "approved" })
      );
      assert.equal((await webhook(9602)).status, 200);
      await prisma.pedido.update({ where: { id: pedido.id }, data: { estado: "CANCELADO" } });

      const mockLog = mock.method(console, "error", () => {});
      let r;
      try {
        r = await webhook(9603);
      } finally {
        mockLog.mock.restore();
      }

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.requiereReembolso, true);
      const pago = await pagoEnBase(pedido.id);
      assert.equal(pago.estado, "APROBADO");
      assert.equal(pago.referenciaExterna, "9603");
      assert.equal(await estadoPedido(pedido.id), "CANCELADO");
    });

    it("RECHAZADO sobre un pedido CANCELADO: 200 no-op, sin Pago", async () => {
      const variante = await crearVariante({ stock: 3 });
      const pedido = await pedidoDe(cliente, { variante, estado: "CANCELADO" });
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "rejected" })
      );

      const r = await webhook(9604);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.procesado, false);
      assert.equal(await pagoEnBase(pedido.id), null);
      assert.equal(await estadoPedido(pedido.id), "CANCELADO");
      assert.equal(await stockDe(variante.id), 3);
      assert.equal((await movimientosDe(variante.id)).length, 0);
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

    it("el monto pagado no coincide con el total -> 409 MONTO_NO_COINCIDE, nada cambia y queda log", async () => {
      const pedido = await pedidoDe(cliente);
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "approved", monto: 100 })
      );

      const { resultado: r, lineas } = await conLogs(() => webhook(9007));

      assertErrorEstandar(r, 409, "MONTO_NO_COINCIDE");
      assert.equal(await pagoEnBase(pedido.id), null);
      assert.equal(await estadoPedido(pedido.id), "PENDIENTE");
      assert.deepEqual(logDe(lineas, "PAGO_APROBADO_NO_APLICADO"), {
        evento: "PAGO_APROBADO_NO_APLICADO",
        motivo: "MONTO_NO_COINCIDE",
        pedidoId: pedido.id,
        paymentId: "9007",
        montoMp: 100,
        totalPedido: Number(pedido.total),
      });
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

      const firma = firmar("9012", "otro-request", "secreto-falso");
      const { resultado: r, lineas } = await conLogs(() => webhook(9012, { firma }));

      assertErrorEstandar(r, 401, "FIRMA_WEBHOOK_INVALIDA");
      assert.equal(mockObtenerPago.mock.callCount(), 0);
      assert.equal(await estadoPedido(pedido.id), "PENDIENTE");
      // Log con el motivo y NADA sensible (ni el header de firma ni el secret).
      assert.deepEqual(logDe(lineas, "WEBHOOK_FIRMA_RECHAZADA"), {
        evento: "WEBHOOK_FIRMA_RECHAZADA",
        motivo: "SignatureMismatch",
      });
      assertLogsSinSecretos(lineas, firma);
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

    it("sin MERCADOPAGO_WEBHOOK_SECRET -> 503 genérico (no filtra el nombre de la variable) y no procesa", async () => {
      const pedido = await pedidoDe(cliente);
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "approved" })
      );
      const mockLog = mock.method(console, "error", () => {});
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET;

      try {
        const r = await webhook(9014);

        assertErrorEstandar(r, 503, "CONFIGURACION_PAGOS_INCOMPLETA");
        assert.equal(r.body.error.mensaje, "El servicio de pagos no está disponible");
        assert.ok(!JSON.stringify(r.body).includes("MERCADOPAGO"));
        assert.equal(mockObtenerPago.mock.callCount(), 0);
        assert.equal(await pagoEnBase(pedido.id), null);
        assert.ok(
          mockLog.mock.calls.some((c) =>
            c.arguments.join(" ").includes("MERCADOPAGO_WEBHOOK_SECRET")
          )
        );
      } finally {
        process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRETO_WEBHOOK;
        mockLog.mock.restore();
      }
    });

    it("firma válida pero con ts de hace más de 5 minutos (replay) -> 401 y sin efectos", async () => {
      const pedido = await pedidoDe(cliente);
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "approved" })
      );
      const requestId = "req-viejo";
      const hace6Minutos = Math.floor(Date.now() / 1000) - 360;
      const firma = firmar("9015", requestId, SECRETO_WEBHOOK, hace6Minutos);

      const { resultado: r, lineas } = await conLogs(() =>
        api("POST", "/api/v1/pagos/mercadopago/webhook", {
          headers: { "x-request-id": requestId, "x-signature": firma },
          body: { type: "payment", data: { id: "9015" } },
        })
      );

      assertErrorEstandar(r, 401, "FIRMA_WEBHOOK_INVALIDA");
      assert.equal(mockObtenerPago.mock.callCount(), 0);
      assert.equal(await pagoEnBase(pedido.id), null);
      assert.equal(await estadoPedido(pedido.id), "PENDIENTE");
      assert.deepEqual(logDe(lineas, "WEBHOOK_FIRMA_RECHAZADA"), {
        evento: "WEBHOOK_FIRMA_RECHAZADA",
        motivo: "TimestampOutOfTolerance",
      });
      assertLogsSinSecretos(lineas, firma);
    });

    it("firma válida pero con ts de dentro de más de 5 minutos (reloj adelantado/forjado) -> 401", async () => {
      const pedido = await pedidoDe(cliente);
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "approved" })
      );
      const requestId = "req-futuro";
      const dentroDe6Minutos = Math.floor(Date.now() / 1000) + 360;
      const firma = firmar("9017", requestId, SECRETO_WEBHOOK, dentroDe6Minutos);

      const { resultado: r, lineas } = await conLogs(() =>
        api("POST", "/api/v1/pagos/mercadopago/webhook", {
          headers: { "x-request-id": requestId, "x-signature": firma },
          body: { type: "payment", data: { id: "9017" } },
        })
      );

      assertErrorEstandar(r, 401, "FIRMA_WEBHOOK_INVALIDA");
      assert.equal(mockObtenerPago.mock.callCount(), 0);
      assert.equal(await estadoPedido(pedido.id), "PENDIENTE");
      assert.equal(logDe(lineas, "WEBHOOK_FIRMA_RECHAZADA").motivo, "TimestampOutOfTolerance");
    });

    it("ts de hace 4 minutos todavía se acepta (dentro de la tolerancia)", async () => {
      const pedido = await pedidoDe(cliente);
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "approved" })
      );
      const requestId = "req-reciente";
      const hace4Minutos = Math.floor(Date.now() / 1000) - 240;

      const r = await api("POST", "/api/v1/pagos/mercadopago/webhook", {
        headers: {
          "x-request-id": requestId,
          "x-signature": firmar("9016", requestId, SECRETO_WEBHOOK, hace4Minutos),
        },
        body: { type: "payment", data: { id: "9016" } },
      });

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(await estadoPedido(pedido.id), "CONFIRMADO");
    });

    it("SEGUNDO pago aprobado (otro paymentId) para un pedido ya pagado: 200 duplicado, no pisa el primero y loguea para reconciliar", async () => {
      const pedido = await pedidoDe(cliente);
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "approved" })
      );
      assert.equal((await webhook(9101)).status, 200);
      const pagoOriginal = await pagoEnBase(pedido.id);

      const mockLog = mock.method(console, "error", () => {});
      let r;
      try {
        r = await webhook(9102);
      } finally {
        mockLog.mock.restore();
      }

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body, { recibido: true, procesado: false, duplicado: true });
      assert.deepEqual(await pagoEnBase(pedido.id), pagoOriginal);
      assert.equal(pagoOriginal.referenciaExterna, "9101");
      assert.equal(await estadoPedido(pedido.id), "CONFIRMADO");

      // Log estructurado: JSON de una línea, sin token ni payload completo.
      const lineas = mockLog.mock.calls.map((c) => c.arguments.join(" "));
      const linea = lineas.find((l) => l.includes("PAGO_DUPLICADO_APROBADO"));
      assert.ok(linea, `no se logueó el duplicado: ${JSON.stringify(lineas)}`);
      assert.ok(!linea.includes("\n"));
      const evento = JSON.parse(linea);
      assert.equal(evento.evento, "PAGO_DUPLICADO_APROBADO");
      assert.equal(evento.pedidoId, pedido.id);
      assert.equal(evento.paymentIdRegistrado, "9101");
      assert.equal(evento.paymentIdDuplicado, "9102");
      assert.equal(evento.monto, Number(pedido.total));
      assert.ok(!linea.includes(process.env.MERCADOPAGO_ACCESS_TOKEN));
    });

    it("evento RECHAZADO para un pedido ya APROBADO: 200 no-op (sin 409 que provoque reintentos)", async () => {
      const variante = await crearVariante({ stock: 3 });
      const pedido = await pedidoDe(cliente, { variante });
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "approved" })
      );
      assert.equal((await webhook(9201)).status, 200);
      const pagoAprobado = await pagoEnBase(pedido.id);

      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "rejected" })
      );
      const r = await webhook(9202);

      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.procesado, false);
      assert.deepEqual(await pagoEnBase(pedido.id), pagoAprobado);
      assert.equal(await estadoPedido(pedido.id), "CONFIRMADO");
      assert.equal(await stockDe(variante.id), 3);
      assert.equal((await movimientosDe(variante.id)).length, 0);
    });

    it("si el pedido desaparece antes de tomar el lock -> 404 PEDIDO_NO_ENCONTRADO (no 500)", async () => {
      const pedido = await pedidoDe(cliente);
      mockObtenerPago.mock.mockImplementation(async ({ id }) =>
        pagoMercadoPago(pedido, { id, status: "approved" })
      );
      const mockLock = mock.method(pedidoRepository, "bloquearPedido", async () => null);

      try {
        const r = await webhook(9301);
        assertErrorEstandar(r, 404, "PEDIDO_NO_ENCONTRADO");
      } finally {
        mockLock.mock.restore();
      }

      assert.equal(await pagoEnBase(pedido.id), null);
      assert.equal(await estadoPedido(pedido.id), "PENDIENTE");
    });
  });
});
