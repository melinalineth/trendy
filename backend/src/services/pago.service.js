// backend/src/services/pago.service.js
//
// Sprint 4 / MOD-07 (DDS §3): pagos con Mercado Pago (RF-034, RF-035, RF-036)
// y contra entrega (RF-037), y consulta del estado del pago (RF-038).
//
// Los errores de dominio llevan `status` y `codigo`: errorHandler.js los
// formatea como { error: { codigo, mensaje, detalles } } (DDS §5.3) sin tener
// que registrarlos, igual que los de inventario y zonas.
//
// Flujo de estados vigente (Pedido / Pago). Política de negocio: un rechazo de
// pago NO es final; el pedido sigue pagable y el cliente puede reintentar.
//   Pedido "pagable": SOLO PENDIENTE (preferencia y webhook).
//   Webhook "approved" sobre un pedido pagable: Pedido -> PAGO_APROBADO ->
//     CONFIRMADO; Pago APROBADO (aunque antes hubiera un intento RECHAZADO).
//     El stock ya se descontó al crear el pedido: no se toca.
//   Webhook "rejected" sobre un pedido pagable: se registra el intento (Pago
//     RECHAZADO con el paymentId); el Pedido NO cambia y el stock NO se repone.
//   Webhook "approved" sobre un pedido CANCELADO: Pago APROBADO, el Pedido
//     sigue CANCELADO, 200 { requiereReembolso: true } + log JSON
//     PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO (reconciliación: Pedido CANCELADO +
//     Pago APROBADO). "rejected" sobre CANCELADO: 200 sin cambios.
//   Webhook sobre cualquier otro estado no pagable sin Pago APROBADO
//     (PAGO_APROBADO, CONFIRMADO ... ENTREGADO y los legados PAGO_RECHAZADO /
//     PAGO_PENDIENTE): 409 PEDIDO_NO_PENDIENTE sin cambios; si era "approved",
//     log PAGO_APROBADO_NO_APLICADO (también con monto distinto al total).
// Status de Mercado Pago tratados:
//   approved / rejected: como arriba.
//   refunded / charged_back: NO cambian pedido ni pago en esta fase (revocar un
//     pedido confirmado requiere una política nueva): 200 { revertido: true } +
//     log PAGO_REVERTIDO_MP para gestionarlo a mano.
//   cancelled, pending, in_process y otros: 200 sin cambios.
// Firma inválida o vieja (> 300 s): 401 + log WEBHOOK_FIRMA_RECHAZADA con el
//   motivo del SDK (nunca la firma, el secret ni el payload).
//   Mismo evento repetido (mismo resultado y paymentId), u otro evento con el
//     Pago ya APROBADO (un "rejected" tardío, o un segundo "approved", que se
//     loguea como PAGO_DUPLICADO_APROBADO): 200 sin cambios (RN-009).
//   Contra entrega: Pago PENDIENTE al registrarlo (el Pedido no cambia) ->
//     APROBADO cuando admin/vendedor confirma la recepción.
// IMPORTANTE: el stock de un pedido con pago rechazado queda retenido hasta
// que se cancele (Fase B: cancelación + vencidos con reposición bajo el mismo
// lock, solo si no hubo pago aprobado). inventario.reponerPorPedido queda para
// eso.
// DEUDA (requiere cambio de esquema, fuera de esta fase): reutilizar la
// preferencia vigente en vez de crear una nueva en cada intento (necesita
// Pago.preferenciaId o similar; hoy dos preferencias vivas permiten pagar dos
// veces, que solo se detecta por log) y persistir el historial de intentos de
// pago (hoy el Pago guarda solo el último paymentId).

const prisma = require("../config/prisma");
const pedidoRepository = require("../repositories/pedido.repository");
const pagoRepository = require("../repositories/pago.repository");
const envioRepository = require("../repositories/envio.repository");

const {
  MercadoPagoConfig,
  Preference,
  Payment,
  WebhookSignatureValidator,
} = require("mercadopago");

// DDS §5.2: 404 = "recurso no encontrado o sin acceso del usuario" (RN-003):
// un pedido ajeno responde igual que uno inexistente.
class PedidoNoEncontradoError extends Error {
  constructor(message = "El pedido no existe o no pertenece al usuario") {
    super(message);
    this.name = "PedidoNoEncontradoError";
    this.status = 404;
    this.codigo = "PEDIDO_NO_ENCONTRADO";
  }
}

// Conflicto de negocio con el pago (409 por defecto): pedido no pendiente,
// método que no coincide, monto distinto al total, pago en un estado que no
// admite la operación, etc. `codigo` permite distinguir el caso.
class PagoInvalidoError extends Error {
  constructor(message = "El pago no es válido", codigo = "PAGO_INVALIDO", status = 409) {
    super(message);
    this.name = "PagoInvalidoError";
    this.status = status;
    this.codigo = codigo;
  }
}

// El pedido de Mercado Pago ya superó su vigencia de pago (creadoEn + horas
// de MERCADOPAGO_PREFERENCIA_HORAS): pedido.service lo va a cancelar como
// vencido y reponer su stock, así que no se emite una preferencia nueva que
// permitiría cobrarlo después (dinero sobre un pedido cancelado).
class PedidoVencidoError extends Error {
  constructor(message = "El plazo para pagar este pedido venció") {
    super(message);
    this.name = "PedidoVencidoError";
    this.status = 409;
    this.codigo = "PEDIDO_VENCIDO";
  }
}

// RN-006: la zona de la dirección del pedido no habilita contra entrega.
class ContraEntregaNoDisponibleError extends Error {
  constructor(message = "El pago contra entrega no está disponible para este pedido") {
    super(message);
    this.name = "ContraEntregaNoDisponibleError";
    this.status = 409;
    this.codigo = "CONTRA_ENTREGA_NO_DISPONIBLE";
  }
}

// RF-038: el pedido existe (y es accesible) pero todavía no tiene Pago, o
// Mercado Pago no reconoce el pago notificado.
class PagoNoEncontradoError extends Error {
  constructor(message = "Este pedido todavía no tiene un pago registrado") {
    super(message);
    this.name = "PagoNoEncontradoError";
    this.status = 404;
    this.codigo = "PAGO_NO_ENCONTRADO";
  }
}

// RF-036: la notificación no viene de Mercado Pago (firma ausente o inválida).
class FirmaWebhookInvalidaError extends Error {
  constructor(message = "La firma del webhook no es válida") {
    super(message);
    this.name = "FirmaWebhookInvalidaError";
    this.status = 401;
    this.codigo = "FIRMA_WEBHOOK_INVALIDA";
  }
}

// Falla de Mercado Pago (red, token, 5xx...). Los errores del SDK traen su
// propio `status` HTTP (p. ej. 401 si el access token es inválido): si se
// propagaran tal cual, errorHandler le respondería al cliente ese 401 como si
// fuera SU sesión la inválida. Se traducen a 502 (pasarela externa).
class PasarelaPagoError extends Error {
  constructor(message = "No fue posible comunicarse con Mercado Pago") {
    super(message);
    this.name = "PasarelaPagoError";
    this.status = 502;
    this.codigo = "PASARELA_NO_DISPONIBLE";
  }
}

// Falta una variable de entorno de Mercado Pago. 503: el servicio no está
// disponible hasta que se configure (no es un error del cliente).
class ConfiguracionPagosError extends Error {
  constructor(message = "El servicio de pagos no está disponible") {
    super(message);
    this.name = "ConfiguracionPagosError";
    this.status = 503;
    this.codigo = "CONFIGURACION_PAGOS_INCOMPLETA";
  }
}

const ROLES_PERSONAL = ["admin", "vendedor"];

// Estados de Pedido sobre los que se puede (re)intentar pagar con Mercado
// Pago: SOLO PENDIENTE (un rechazo deja el pedido PENDIENTE). Los legados
// PAGO_RECHAZADO / PAGO_PENDIENTE NO: el flujo viejo ya había repuesto su
// stock y aprobarlos generaría sobreventa (y no existen datos con ellos: el
// código de sprint-4 nunca arrancó).
const ESTADOS_PEDIDO_PAGABLES = Object.freeze(["PENDIENTE"]);

// status de Mercado Pago que revierten un pago ya cobrado (ver procesarWebhook).
const STATUS_MP_REVERTIDOS = Object.freeze(["refunded", "charged_back"]);

// Margen restado al inicio de vigencia de la preferencia por si el reloj del
// servidor está adelantado respecto del de Mercado Pago.
const MARGEN_RELOJ_PREFERENCIA_MS = 60 * 1000;

// Offset fijo de Colombia (UTC-5, sin horario de verano): no depende de la zona
// horaria del servidor.
const OFFSET_COLOMBIA_MS = 5 * 60 * 60 * 1000;

// Escribe un instante como ISO 8601 con milisegundos y offset de Colombia
// ("2017-02-01T12:00:00.000-05:00"), el formato que usa la documentación de
// Checkout Pro para las fechas de la preferencia. Es el MISMO instante que
// `new Date(instante).toISOString()`, pero con la hora local (UTC - 5 h).
function aIsoColombia(instante) {
  const local = new Date(new Date(instante).getTime() - OFFSET_COLOMBIA_MS);

  // toISOString() de la fecha desplazada trae la hora local; se reemplaza el
  // sufijo "Z" (que ahora sería falso) por el offset real.
  return `${local.toISOString().slice(0, -1)}-05:00`;
}

// Log estructurado: JSON de UNA línea para poder filtrarlo y reconciliar.
// Quien llama arma el objeto: nunca tokens, firmas ni payloads completos.
function logEvento(evento) {
  console.error(JSON.stringify(evento));
}

// Un "approved" que no se pudo aplicar = dinero cobrado sin pedido
// confirmado: necesita reconciliación manual.
function logPagoAprobadoNoAplicado(motivo, pedido, paymentId, pagoMP) {
  logEvento({
    evento: "PAGO_APROBADO_NO_APLICADO",
    motivo,
    pedidoId: pedido.id,
    paymentId,
    montoMp: Number(pagoMP.transaction_amount),
    totalPedido: Number(pedido.total),
  });
}

// Vigencia de la preferencia de Checkout Pro (MERCADOPAGO_PREFERENCIA_HORAS):
// entero de 1 a 168 (una semana); cualquier otro valor usa el default.
const HORAS_PREFERENCIA_DEFAULT = 24;
const HORAS_PREFERENCIA_MAXIMO = 168;

function horasDeVigenciaPreferencia() {
  const texto = (process.env.MERCADOPAGO_PREFERENCIA_HORAS ?? "").trim();

  if (!/^\d+$/.test(texto)) {
    return HORAS_PREFERENCIA_DEFAULT;
  }

  const horas = Number(texto);
  return horas >= 1 && horas <= HORAS_PREFERENCIA_MAXIMO ? horas : HORAS_PREFERENCIA_DEFAULT;
}

// RF-036 anti-replay: diferencia máxima, en SEGUNDOS, entre el `ts` de la
// firma y el reloj del servidor (WebhookSignatureValidator compara
// |ahora - ts*1000| / 1000 contra este valor).
const TOLERANCIA_FIRMA_SEGUNDOS = 300;

// status de un pago de Mercado Pago -> EstadoPago que se registra. Los demás
// (pending, in_process, authorized...) no cambian nada todavía (RF-035).
const ESTADO_PAGO_POR_STATUS_MP = Object.freeze({
  approved: "APROBADO",
  rejected: "RECHAZADO",
});

function validarPedidoId(pedidoId) {
  const id = Number(pedidoId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new PagoInvalidoError(
      "El identificador del pedido no es válido",
      "VALIDACION_FALLIDA",
      400
    );
  }

  return id;
}

// Montos en centavos enteros para comparar sin errores de coma flotante
// (Decimal(10,2) en la base, Number en Mercado Pago).
const aCentavos = (monto) => Math.round(Number(monto) * 100);

// Forma de respuesta de un Pago: monto como Number (Prisma serializa Decimal
// como string).
function presentarPago(pago) {
  return {
    id: pago.id,
    pedidoId: pago.pedidoId,
    metodo: pago.metodo,
    estado: pago.estado,
    monto: Number(pago.monto),
    referenciaExterna: pago.referenciaExterna,
    actualizadoEn: pago.actualizadoEn,
  };
}

// Lee una variable de entorno obligatoria de pagos. Si falta, el log del
// servidor dice CUÁL (solo el nombre, nunca valores) y al cliente le llega un
// 503 genérico: el webhook es público y no debe revelar la configuración.
function exigirVariable(nombre) {
  const valor = process.env[nombre];

  if (!valor) {
    console.error(`Configuración de pagos incompleta: falta la variable de entorno ${nombre}`);
    throw new ConfiguracionPagosError();
  }

  return valor;
}

function obtenerClienteMercadoPago() {
  const accessToken = exigirVariable("MERCADOPAGO_ACCESS_TOKEN");

  return new MercadoPagoConfig({
    accessToken,
    options: { timeout: 5000 },
  });
}

/**
 * Crea una preferencia de Checkout Pro usando los datos reales
 * guardados en el pedido (nunca un monto enviado por el cliente).
 */
async function crearPreferencia(pedidoId, usuarioId) {
  const id = validarPedidoId(pedidoId);

  const pedido = await pedidoRepository.obtenerDeUsuario(id, Number(usuarioId));

  if (!pedido) {
    throw new PedidoNoEncontradoError();
  }

  if (!ESTADOS_PEDIDO_PAGABLES.includes(pedido.estado)) {
    throw new PagoInvalidoError("Solo se pueden pagar pedidos pendientes", "PEDIDO_NO_PENDIENTE");
  }

  if (pedido.metodoPago !== "MERCADO_PAGO") {
    throw new PagoInvalidoError(
      "El pedido no se creó para pagar con Mercado Pago",
      "METODO_PAGO_NO_COINCIDE"
    );
  }

  // Vigencia del pedido para pagar: creadoEn + horas (la misma que usa la
  // cancelación de vencidos, que corta en horas + margen). Pasado ese límite
  // no se llama a Mercado Pago. `creadoEn` viene en el pedido que ya se leyó
  // (obtenerDeUsuario trae todas sus columnas).
  const horasVigencia = horasDeVigenciaPreferencia();
  const limitePedido = new Date(pedido.creadoEn).getTime() + horasVigencia * 60 * 60 * 1000;
  if (Date.now() >= limitePedido) {
    throw new PedidoVencidoError();
  }

  if (!pedido.detalles || pedido.detalles.length === 0) {
    throw new PagoInvalidoError("El pedido no contiene productos");
  }

  const items = pedido.detalles.map((detalle) => {
    const precio = Number(detalle.precioUnitario);
    const cantidad = Number(detalle.cantidad);
    const nombre = detalle.variante?.producto?.nombre || `Producto ${detalle.varianteId}`;

    if (!Number.isFinite(precio) || precio <= 0 || !Number.isInteger(cantidad) || cantidad <= 0) {
      throw new PagoInvalidoError("El pedido contiene un producto con datos inválidos");
    }

    return {
      id: String(detalle.varianteId),
      title: nombre,
      quantity: cantidad,
      unit_price: precio,
      currency_id: "COP",
    };
  });

  // El total del pedido incluye el envío: si no viaja como ítem, Mercado Pago
  // cobraría solo el subtotal y procesarWebhook rechazaría el pago porque el
  // monto no coincide con Pedido.total.
  const costoEnvio = Number(pedido.costoEnvio);
  if (costoEnvio > 0) {
    items.push({
      id: "envio",
      title: "Costo de envío",
      quantity: 1,
      unit_price: costoEnvio,
      currency_id: "COP",
    });
  }

  // Defensa: fuentes no oficiales (a confirmar en sandbox) indican que Mercado
  // Pago solo acepta montos ENTEROS en COP. Un unit_price con centavos
  // (precio histórico de un pedido viejo, o un costo de envío cargado antes de
  // la regla "COP en pesos enteros") se corta acá, antes de llamar a la
  // pasarela, con un error que dice qué línea es.
  const lineaConCentavos = items.find((item) => aCentavos(item.unit_price) % 100 !== 0);
  if (lineaConCentavos) {
    throw new PagoInvalidoError(
      `El monto de "${lineaConCentavos.title}" tiene centavos y Mercado Pago solo ` +
        "acepta montos enteros en pesos (COP)",
      "MONTO_NO_ENTERO_COP"
    );
  }

  // Lo que Mercado Pago va a cobrar tiene que ser EXACTAMENTE Pedido.total
  // (en centavos, sin errores de coma flotante): si no, el webhook rechazaría
  // el pago por monto distinto después de que el cliente ya pagó.
  const totalItems = items.reduce(
    (suma, item) => suma + aCentavos(item.unit_price) * item.quantity,
    0
  );
  if (totalItems !== aCentavos(pedido.total)) {
    throw new PagoInvalidoError(
      "Las líneas y el envío del pedido no suman su total",
      "TOTAL_INCONSISTENTE"
    );
  }

  const preference = new Preference(obtenerClienteMercadoPago());

  // La preferencia vence: un link de pago viejo no debe poder usarse días
  // después (el pedido podría haberse cancelado). ISO 8601 con milisegundos y
  // offset de Colombia (-05:00), como el ejemplo de la documentación oficial de
  // Checkout Pro (ver aIsoColombia).
  //   - desde: ahora menos un margen, por si nuestro reloj va adelantado
  //     respecto del de Mercado Pago (si no, la preferencia "todavía no rige").
  //   - date_of_expiration = expiration_date_to: el SDK lo tipa en
  //     commonTypes.d.ts, pero la documentación oficial NO lo confirma como
  //     campo del request; se envía igual por si Mercado Pago lo respeta (un
  //     pago en efectivo/ticket generado antes del vencimiento no se
  //     acreditaría después). Si lo ignora, no hay efecto: queda por verificar
  //     en sandbox.
  //   - hasta: el MENOR entre ahora + horas y creadoEn + horas. Una
  //     preferencia creada a la hora 23 de un pedido no puede vivir hasta la
  //     hora 47: el pedido se cancela por vencido a las 24 h (+ margen) y un
  //     pago posterior caería sobre un pedido CANCELADO (reembolso manual).
  const ahora = Date.now();
  const desde = aIsoColombia(ahora - MARGEN_RELOJ_PREFERENCIA_MS);
  const vence = aIsoColombia(Math.min(ahora + horasVigencia * 60 * 60 * 1000, limitePedido));

  let resultado;
  try {
    resultado = await preference.create({
      body: {
        items,
        expires: true,
        expiration_date_from: desde,
        expiration_date_to: vence,
        date_of_expiration: vence,
        external_reference: String(pedido.id),
        metadata: {
          pedido_id: pedido.id,
        },
        // URL pública del webhook (ver .env.example).
        ...(process.env.MERCADOPAGO_WEBHOOK_URL
          ? { notification_url: process.env.MERCADOPAGO_WEBHOOK_URL }
          : {}),
      },
    });
  } catch (error) {
    console.error("Error de Mercado Pago al crear la preferencia:", error);
    throw new PasarelaPagoError();
  }

  if (!resultado?.init_point) {
    throw new PasarelaPagoError("Mercado Pago no devolvió la URL de checkout");
  }

  return {
    pedidoId: pedido.id,
    preferenciaId: resultado.id,
    checkoutUrl: resultado.init_point,
  };
}

// Consulta el pago a Mercado Pago (no se confía en el estado que trae el body
// del webhook). Un 404 del SDK = pago desconocido; cualquier otra falla, 502.
async function obtenerPagoMercadoPago(paymentId) {
  const paymentClient = new Payment(obtenerClienteMercadoPago());

  try {
    return await paymentClient.get({ id: paymentId });
  } catch (error) {
    if (error?.status === 404) {
      throw new PagoNoEncontradoError("Mercado Pago no reconoce el pago notificado");
    }

    console.error("Error de Mercado Pago al consultar el pago:", error);
    throw new PasarelaPagoError();
  }
}

/**
 * Verifica la firma, consulta el pago directamente a Mercado Pago
 * y actualiza el pedido sin volver a descontar inventario.
 *
 * firma debe tener: xSignature, xRequestId y dataId.
 *
 * Idempotencia (RN-009): cada evento se procesa en una transacción que toma el
 * lock de la fila del pedido y recién entonces mira Pago.estado. Dos
 * notificaciones repetidas (incluso simultáneas) se serializan: la segunda ve
 * el Pago ya actualizado y no hace nada (devuelve procesado: false).
 */
async function procesarWebhook(payload, firma) {
  const secreto = exigirVariable("MERCADOPAGO_WEBHOOK_SECRET");

  if (!firma?.xSignature || !firma?.dataId) {
    logEvento({ evento: "WEBHOOK_FIRMA_RECHAZADA", motivo: "MissingSignatureHeader" });
    throw new FirmaWebhookInvalidaError("Faltan datos para validar el webhook");
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature: firma.xSignature,
      xRequestId: firma.xRequestId || "",
      dataId: String(firma.dataId),
      secret: secreto,
      // Una firma válida pero vieja (replay) también se rechaza.
      toleranceSeconds: TOLERANCIA_FIRMA_SEGUNDOS,
    });
  } catch (error) {
    // Solo el motivo que informa el SDK (SignatureMismatch,
    // TimestampOutOfTolerance...): NUNCA el header de firma, el secret ni el
    // payload.
    logEvento({
      evento: "WEBHOOK_FIRMA_RECHAZADA",
      motivo: typeof error?.reason === "string" ? error.reason : "Desconocido",
    });
    throw new FirmaWebhookInvalidaError();
  }

  // Ignorar notificaciones que no correspondan a pagos.
  if (payload?.type !== "payment") {
    return { recibido: true, procesado: false };
  }

  // Recortado por defensa: el validador del SDK también hace trim() del dataId
  // al armar el manifest, así que se consulta exactamente el id firmado.
  const paymentId = String(firma.dataId).trim();

  // No confiar en el estado enviado en el cuerpo del webhook.
  const pagoMP = await obtenerPagoMercadoPago(paymentId);

  const pedidoId = Number(pagoMP.external_reference || pagoMP.metadata?.pedido_id);
  const pedidoIdValido = Number.isInteger(pedidoId) && pedidoId > 0;

  // Reembolso o contracargo: en esta fase NO se cambia ni el pedido ni el pago
  // (revocar un pedido ya confirmado requiere una política de negocio nueva),
  // pero queda visible en el log para gestionarlo a mano. No toca la base, así
  // que no interfiere con la idempotencia.
  if (STATUS_MP_REVERTIDOS.includes(pagoMP.status)) {
    logEvento({
      evento: "PAGO_REVERTIDO_MP",
      ...(pedidoIdValido ? { pedidoId } : {}),
      paymentId,
      estadoMp: pagoMP.status,
      monto: Number(pagoMP.transaction_amount),
    });
    return { recibido: true, procesado: false, revertido: true };
  }

  if (!pedidoIdValido) {
    throw new PagoInvalidoError(
      "El pago no contiene una referencia válida al pedido",
      "REFERENCIA_INVALIDA"
    );
  }

  // Comprobar que el pago corresponde al importe real del pedido.
  const pedido = await pedidoRepository.obtenerPorId(pedidoId);

  if (!pedido) {
    throw new PedidoNoEncontradoError();
  }

  if (aCentavos(pagoMP.transaction_amount) !== aCentavos(pedido.total)) {
    if (pagoMP.status === "approved") {
      logPagoAprobadoNoAplicado("MONTO_NO_COINCIDE", pedido, paymentId, pagoMP);
    }
    throw new PagoInvalidoError(
      "El importe del pago no coincide con el total del pedido",
      "MONTO_NO_COINCIDE"
    );
  }

  // hasOwn (y no `objeto[status]` a secas) para que un status como
  // "constructor" no resuelva a una propiedad heredada.
  const estadoPago = Object.hasOwn(ESTADO_PAGO_POR_STATUS_MP, pagoMP.status)
    ? ESTADO_PAGO_POR_STATUS_MP[pagoMP.status]
    : null;

  // Pendiente, en proceso u otro estado: se reconoce la notificación,
  // pero no se modifica el pedido (RF-035).
  if (!estadoPago) {
    return {
      recibido: true,
      procesado: false,
      estadoPago: pagoMP.status,
    };
  }

  return prisma.$transaction(async (tx) => {
    // Lock de la fila del pedido: serializa eventos concurrentes (RN-009). El
    // estado que devuelve es el vigente (leído con el lock tomado).
    const bloqueado = await pedidoRepository.bloquearPedido(pedidoId, tx);

    if (!bloqueado) {
      throw new PedidoNoEncontradoError();
    }

    const pagoActual = await pagoRepository.buscarPorPedido(pedidoId, tx);

    if (pagoActual && pagoActual.metodo !== "MERCADO_PAGO") {
      throw new PagoInvalidoError(
        "El pedido ya tiene registrado otro método de pago",
        "METODO_PAGO_NO_COINCIDE"
      );
    }

    if (pagoActual?.estado === "APROBADO") {
      // Un pago aprobado es final: cualquier evento posterior se reconoce con
      // 200 (para que Mercado Pago deje de reintentar) sin tocar nada.
      if (estadoPago === "APROBADO" && pagoActual.referenciaExterna !== paymentId) {
        // OTRO pago aprobado para el mismo pedido (el cliente pagó dos
        // veces). No hay dónde guardar el segundo intento (deuda: persistir
        // intentos de pago), así que se deja una línea JSON para reconciliar
        // a mano (y eventualmente devolver el dinero).
        console.error(
          JSON.stringify({
            evento: "PAGO_DUPLICADO_APROBADO",
            pedidoId,
            paymentIdRegistrado: pagoActual.referenciaExterna,
            paymentIdDuplicado: paymentId,
            monto: Number(pagoMP.transaction_amount),
          })
        );
        return { recibido: true, procesado: false, duplicado: true };
      }

      // Mismo evento repetido, o un "rejected" tardío: no-op.
      return { recibido: true, procesado: false };
    }

    // Idempotencia: el MISMO intento (mismo resultado y mismo paymentId) ya
    // registrado no se procesa de nuevo. Un rechazo NO es final: un intento
    // distinto (otro paymentId) sí se procesa.
    if (pagoActual?.estado === estadoPago && pagoActual.referenciaExterna === paymentId) {
      return { recibido: true, procesado: false };
    }

    const resultadoPago = {
      pedidoId,
      metodo: "MERCADO_PAGO",
      estado: estadoPago,
      referenciaExterna: paymentId,
      monto: Number(pagoMP.transaction_amount),
    };

    if (bloqueado.estado === "CANCELADO") {
      // Un rechazo sobre un pedido cancelado no aporta nada.
      if (estadoPago === "RECHAZADO") {
        return { recibido: true, procesado: false };
      }

      // Pagó un pedido que ya estaba cancelado: se guarda el Pago APROBADO
      // (la señal de reconciliación es Pedido CANCELADO + Pago APROBADO) sin
      // tocar el pedido ni el stock, se responde 200 para cortar los
      // reintentos y se deja una línea JSON para gestionar el reembolso.
      await pagoRepository.guardarResultado(resultadoPago, tx);
      console.error(
        JSON.stringify({
          evento: "PAGO_APROBADO_SOBRE_PEDIDO_CANCELADO",
          pedidoId,
          paymentId,
          monto: resultadoPago.monto,
        })
      );
      return { recibido: true, procesado: false, requiereReembolso: true };
    }

    if (estadoPago === "APROBADO") {
      if (!ESTADOS_PEDIDO_PAGABLES.includes(bloqueado.estado)) {
        // Dinero cobrado sin pedido confirmado: el pedido NO cambia (un
        // ENVIADO no retrocede a CONFIRMADO) y queda la señal en el log.
        logPagoAprobadoNoAplicado("PEDIDO_NO_PENDIENTE", pedido, paymentId, pagoMP);
        throw new PagoInvalidoError(
          "El pedido ya no está en un estado válido para aprobar el pago",
          "PEDIDO_NO_PENDIENTE"
        );
      }

      // Si antes hubo un intento rechazado, el Pago pasa de RECHAZADO a
      // APROBADO con el paymentId del intento aprobado.
      await pagoRepository.guardarResultado(resultadoPago, tx);

      // Registrar el estado intermedio y luego confirmar el pedido.
      await pedidoRepository.actualizarEstado(pedidoId, "PAGO_APROBADO", tx);
      await pedidoRepository.actualizarEstado(pedidoId, "CONFIRMADO", tx);

      // El inventario se descontó al crear el pedido.
      // NO volver a descontarlo aquí.

      return { recibido: true, procesado: true };
    }

    // Rechazado: un rechazo NO es final. Se registra el intento y el pedido
    // queda como está (pagable: el cliente puede reintentar). El stock NO se
    // repone: queda retenido hasta que el pedido se cancele (Fase B).
    if (!ESTADOS_PEDIDO_PAGABLES.includes(bloqueado.estado)) {
      throw new PagoInvalidoError("El pedido ya no está pendiente de pago", "PEDIDO_NO_PENDIENTE");
    }

    await pagoRepository.guardarResultado(resultadoPago, tx);

    return { recibido: true, procesado: true };
  });
}

/**
 * RF-037 / RN-006: registra el pago contra entrega de un pedido del cliente,
 * solo si la zona de cobertura de su dirección lo habilita. El Pago queda
 * PENDIENTE hasta que admin/vendedor confirme la recepción. Repetir la
 * solicitud devuelve el mismo Pago (no duplica).
 */
async function registrarContraEntrega(pedidoId, usuarioId) {
  const id = validarPedidoId(pedidoId);

  const pedido = await pedidoRepository.obtenerDeUsuario(id, Number(usuarioId));

  if (!pedido) {
    throw new PedidoNoEncontradoError();
  }

  if (pedido.estado !== "PENDIENTE") {
    throw new PagoInvalidoError(
      "Solo se puede registrar contra entrega para pedidos pendientes",
      "PEDIDO_NO_PENDIENTE"
    );
  }

  // RF-037: "el pedido quedará registrado con el método de pago
  // correspondiente": el Pago no puede contradecir a Pedido.metodoPago.
  if (pedido.metodoPago !== "CONTRA_ENTREGA") {
    throw new PagoInvalidoError(
      "El pedido no se creó para pagar contra entrega",
      "METODO_PAGO_NO_COINCIDE"
    );
  }

  if (!pedido.direccion) {
    throw new ContraEntregaNoDisponibleError("El pedido no tiene una dirección de entrega");
  }

  const zona = await envioRepository.buscarZonaPorDireccion(
    pedido.direccion.ciudad,
    pedido.direccion.departamento
  );

  if (!zona || zona.permiteContraEntrega !== true) {
    throw new ContraEntregaNoDisponibleError();
  }

  // Lock del pedido: dos solicitudes simultáneas se serializan y la segunda
  // ve el Pago que creó la primera (sin esto chocaban con el unique de
  // Pago.pedidoId y respondían 409).
  const pago = await prisma.$transaction(async (tx) => {
    const bloqueado = await pedidoRepository.bloquearPedido(id, tx);

    if (!bloqueado) {
      throw new PedidoNoEncontradoError();
    }

    const pagoExistente = await pagoRepository.buscarPorPedido(id, tx);

    if (pagoExistente) {
      if (pagoExistente.metodo === "CONTRA_ENTREGA") {
        // Evita crear registros duplicados si se repite la solicitud.
        return pagoExistente;
      }

      throw new PagoInvalidoError(
        "El pedido ya tiene registrado otro método de pago",
        "METODO_PAGO_NO_COINCIDE"
      );
    }

    if (bloqueado.estado !== "PENDIENTE") {
      throw new PagoInvalidoError(
        "Solo se puede registrar contra entrega para pedidos pendientes",
        "PEDIDO_NO_PENDIENTE"
      );
    }

    return pagoRepository.crear(
      {
        pedidoId: id,
        metodo: "CONTRA_ENTREGA",
        monto: pedido.total,
        estado: "PENDIENTE",
        referenciaExterna: null,
      },
      tx
    );
  });

  return presentarPago(pago);
}

/**
 * RF-037: admin/vendedor registra la recepción del pago contra entrega (el
 * rol lo restringe roleGuard en la ruta). PENDIENTE -> APROBADO; si ya estaba
 * APROBADO devuelve el mismo pago (idempotente).
 */
async function confirmarRecepcionContraEntrega(pedidoId) {
  const id = validarPedidoId(pedidoId);

  // Lock del pedido: confirmaciones simultáneas se serializan y todas ven el
  // Pago ya APROBADO por la primera (sin lock, algunas respondían el Pago
  // todavía PENDIENTE).
  const pago = await prisma.$transaction(async (tx) => {
    const bloqueado = await pedidoRepository.bloquearPedido(id, tx);

    if (!bloqueado) {
      throw new PedidoNoEncontradoError();
    }

    const pagoActual = await pagoRepository.buscarPorPedido(id, tx);

    if (!pagoActual || pagoActual.metodo !== "CONTRA_ENTREGA") {
      throw new PagoInvalidoError("El pedido no tiene un pago contra entrega registrado");
    }

    if (pagoActual.estado === "APROBADO") {
      return pagoActual;
    }

    if (pagoActual.estado !== "PENDIENTE") {
      throw new PagoInvalidoError("El pago no se encuentra pendiente de confirmación");
    }

    if (bloqueado.estado === "CANCELADO") {
      throw new PagoInvalidoError(
        "No se puede confirmar el pago de un pedido cancelado",
        "PEDIDO_CANCELADO"
      );
    }

    return pagoRepository.actualizarEstado(id, "APROBADO", pagoActual.referenciaExterna, tx);
  });

  return presentarPago(pago);
}

/**
 * RF-038: estado del pago de un pedido. El cliente solo ve los suyos (RN-003:
 * uno ajeno responde 404, igual que uno inexistente); admin y vendedor ven
 * cualquiera.
 */
async function consultarEstadoPago(pedidoId, usuarioId, rol = "cliente") {
  const id = validarPedidoId(pedidoId);

  const pedido = await pedidoRepository.obtenerPorId(id);

  if (!pedido) {
    throw new PedidoNoEncontradoError();
  }

  if (!ROLES_PERSONAL.includes(rol) && Number(pedido.usuarioId) !== Number(usuarioId)) {
    // No revelar la existencia de pedidos de otros clientes.
    throw new PedidoNoEncontradoError();
  }

  if (!pedido.pago) {
    throw new PagoNoEncontradoError();
  }

  return presentarPago(pedido.pago);
}

module.exports = {
  crearPreferencia,
  procesarWebhook,
  registrarContraEntrega,
  confirmarRecepcionContraEntrega,
  consultarEstadoPago,
  // Fase B: pedido.service usa la misma vigencia (y el mismo parseo) para
  // decidir cuándo un pedido de Mercado Pago sin pagar está vencido.
  horasDeVigenciaPreferencia,
  HORAS_PREFERENCIA_MAXIMO,
  aIsoColombia,
  PedidoNoEncontradoError,
  PagoInvalidoError,
  PedidoVencidoError,
  ContraEntregaNoDisponibleError,
  PagoNoEncontradoError,
  FirmaWebhookInvalidaError,
  PasarelaPagoError,
  ConfiguracionPagosError,
};
