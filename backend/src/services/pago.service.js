// backend/src/services/pago.service.js
//
// Sprint 4 / MOD-07 (DDS §3): pagos con Mercado Pago (RF-034, RF-035, RF-036)
// y contra entrega (RF-037), y consulta del estado del pago (RF-038).
//
// Los errores de dominio llevan `status` y `codigo`: errorHandler.js los
// formatea como { error: { codigo, mensaje, detalles } } (DDS §5.3) sin tener
// que registrarlos, igual que los de inventario y zonas.
//
// Flujo de estados vigente (Pedido / Pago):
//   Mercado Pago, webhook "approved": Pedido PENDIENTE -> PAGO_APROBADO ->
//     CONFIRMADO; Pago APROBADO (el stock ya se descontó al crear el pedido).
//   Mercado Pago, webhook "rejected": Pedido PENDIENTE -> PAGO_RECHAZADO; Pago
//     RECHAZADO; se repone el stock en la misma transacción.
//   Otros status (pending, in_process...): no cambian nada.
//   Eventos repetidos o tardíos con el Pago ya APROBADO (mismo paymentId, otro
//     paymentId aprobado, o un "rejected") -> 200 sin cambios (RN-009).
//   Contra entrega: Pago PENDIENTE al registrarlo (el Pedido no cambia) ->
//     APROBADO cuando admin/vendedor confirma la recepción.
// PENDIENTE DE DECISIÓN DE NEGOCIO: qué hacer si llega un "approved" después
// de un "rejected" (reintento del cliente en Checkout Pro). Hoy el pedido ya
// está PAGO_RECHAZADO y el evento responde 409.

const prisma = require("../config/prisma");
const pedidoRepository = require("../repositories/pedido.repository");
const pagoRepository = require("../repositories/pago.repository");
const envioRepository = require("../repositories/envio.repository");
const inventarioRepository = require("../repositories/inventario.repository");

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

  if (pedido.estado !== "PENDIENTE") {
    throw new PagoInvalidoError("Solo se pueden pagar pedidos pendientes", "PEDIDO_NO_PENDIENTE");
  }

  if (pedido.metodoPago !== "MERCADO_PAGO") {
    throw new PagoInvalidoError(
      "El pedido no se creó para pagar con Mercado Pago",
      "METODO_PAGO_NO_COINCIDE"
    );
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

  let resultado;
  try {
    resultado = await preference.create({
      body: {
        items,
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
  } catch {
    throw new FirmaWebhookInvalidaError();
  }

  // Ignorar notificaciones que no correspondan a pagos.
  if (payload?.type !== "payment") {
    return { recibido: true, procesado: false };
  }

  const paymentId = String(firma.dataId);

  // No confiar en el estado enviado en el cuerpo del webhook.
  const pagoMP = await obtenerPagoMercadoPago(paymentId);

  const pedidoId = Number(pagoMP.external_reference || pagoMP.metadata?.pedido_id);

  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
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

    // Idempotencia: el mismo resultado ya aplicado no se procesa de nuevo.
    if (pagoActual?.estado === estadoPago) {
      return { recibido: true, procesado: false };
    }

    const monto = Number(pagoMP.transaction_amount);

    if (estadoPago === "APROBADO") {
      if (bloqueado.estado !== "PENDIENTE" && bloqueado.estado !== "PAGO_APROBADO") {
        throw new PagoInvalidoError(
          "El pedido ya no está en un estado válido para aprobar el pago",
          "PEDIDO_NO_PENDIENTE"
        );
      }

      await pagoRepository.guardarResultado(
        {
          pedidoId,
          metodo: "MERCADO_PAGO",
          estado: "APROBADO",
          referenciaExterna: paymentId,
          monto,
        },
        tx
      );

      // Registrar el estado intermedio y luego confirmar el pedido.
      await pedidoRepository.actualizarEstado(pedidoId, "PAGO_APROBADO", tx);
      await pedidoRepository.actualizarEstado(pedidoId, "CONFIRMADO", tx);

      // El inventario se descontó al crear el pedido.
      // NO volver a descontarlo aquí.

      return { recibido: true, procesado: true };
    }

    // Rechazado: se libera el stock reservado al crear el pedido, en la misma
    // transacción que el cambio de estado (todo o nada).
    if (bloqueado.estado !== "PENDIENTE") {
      throw new PagoInvalidoError("El pedido ya no está pendiente de pago", "PEDIDO_NO_PENDIENTE");
    }

    // Las líneas y el dueño del pedido no cambian después de crearlo: se usan
    // los leídos antes de la transacción.
    await inventarioRepository.reponerPorPedido(
      pedido.detalles.map(({ varianteId, cantidad }) => ({ varianteId, cantidad })),
      {
        usuarioId: pedido.usuarioId,
        pedidoId,
        motivo: "Pedido rechazado",
        tx,
      }
    );

    await pagoRepository.guardarResultado(
      {
        pedidoId,
        metodo: "MERCADO_PAGO",
        estado: "RECHAZADO",
        referenciaExterna: paymentId,
        monto,
      },
      tx
    );

    await pedidoRepository.actualizarEstado(pedidoId, "PAGO_RECHAZADO", tx);

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
  PedidoNoEncontradoError,
  PagoInvalidoError,
  ContraEntregaNoDisponibleError,
  PagoNoEncontradoError,
  FirmaWebhookInvalidaError,
  PasarelaPagoError,
  ConfiguracionPagosError,
};
