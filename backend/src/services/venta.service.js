// Sprint 5 / MOD-09 (DDS §3): registro de ventas (RF-041).
//
// REGLA DE NEGOCIO: la venta nace cuando el PEDIDO queda confirmado (no cuando
// el Pago queda APROBADO). Con Mercado Pago son el mismo instante (el webhook
// aprueba el pago y confirma el pedido en la misma transacción); con contra
// entrega la venta aparece cuando admin/vendedor confirma el pedido, aunque el
// cobro se registre después (confirmar-recepcion). Si el pedido se cancela
// (solo contra entrega ya confirmado, docs/diseno/pedidos-estados.md §6), su
// venta se ANULA: nunca se borra.
//
// Este service no abre transacciones: quien cambia el estado del pedido
// (pago.service.procesarWebhook, pedido.service.actualizarEstado y
// cancelarBajoLock) le pasa su `tx`, con el lock del pedido tomado, para que la
// venta y el cambio de estado se confirmen o se revierten juntos.
//
// Los errores de dominio llevan `status`, `codigo` y `detalles`: errorHandler.js
// los formatea como { error: { codigo, mensaje, detalles } } (DDS §5.3).
const ventaRepository = require("../repositories/venta.repository");

// Estados de un pedido confirmado y no cancelado: los únicos que cuentan como
// venta. NO cuentan PENDIENTE, PAGO_PENDIENTE, PAGO_RECHAZADO, CANCELADO ni
// PAGO_APROBADO (estado de paso: el webhook lo lleva a CONFIRMADO en la misma
// transacción, y es ahí donde nace la venta). Misma lista que el backfill de la
// migración `backfill_ventas`.
const ESTADOS_QUE_CUENTAN = Object.freeze([
  "CONFIRMADO",
  "EN_PREPARACION",
  "ENVIADO",
  "EN_TRANSITO",
  "ENTREGADO",
]);

// Definida acá (y no reutilizando la de pago.service) para no crear un ciclo
// de dependencias: pago.service importa este módulo. Mismo status y código.
class PedidoNoEncontradoError extends Error {
  constructor(message = "El pedido no existe") {
    super(message);
    this.name = "PedidoNoEncontradoError";
    this.status = 404;
    this.codigo = "PEDIDO_NO_ENCONTRADO";
  }
}

// El pedido todavía no está confirmado (o se canceló): no genera venta.
class PedidoNoConfirmadoError extends Error {
  constructor(estado) {
    super(`El pedido está ${estado}: solo un pedido confirmado genera una venta`);
    this.name = "PedidoNoConfirmadoError";
    this.status = 409;
    this.codigo = "PEDIDO_NO_CONFIRMADO";
    this.detalles = { estado };
  }
}

// Índice único de Venta.pedidoId (nombre que le da Prisma/MySQL).
const INDICE_PEDIDO_DE_VENTA = "Venta_pedidoId_key";

// ¿El P2002 es el unique de Venta.pedidoId? Con el adapter de MariaDB el índice
// viene en meta.driverAdapterError.cause.constraint (sin meta.target); sin
// adapter, en meta.target (campos o nombre del índice). Cualquier otro unique
// es un error real y no se confunde con la carrera de "otro la registró".
function esUniqueDePedido(error) {
  if (error?.code !== "P2002") return false;

  const meta = error.meta ?? {};
  const restriccion = meta.driverAdapterError?.cause?.constraint ?? {};
  const candidatos = [
    ...[meta.target].flat(),
    restriccion.index,
    ...[restriccion.fields].flat(),
  ].filter((valor) => typeof valor === "string");

  return candidatos.some((valor) => valor === "pedidoId" || valor === INDICE_PEDIDO_DE_VENTA);
}

/**
 * Registra la venta de un pedido confirmado. IDEMPOTENTE (RF-041, RN-009): si el
 * pedido ya tiene venta la devuelve sin escribir, también ante la carrera de dos
 * registros simultáneos (el unique de `pedidoId` deja pasar uno solo; el otro
 * relee y devuelve la existente).
 *
 * Copia `subtotal`, `costoEnvio`, `total`, `metodoPago` y el cliente del PEDIDO,
 * leído con lock dentro de la misma `tx` (RN-008: nunca recalcula con los
 * precios vigentes). `responsableId` es NULL cuando la dispara el webhook de
 * Mercado Pago y el usuario admin/vendedor cuando es un cambio manual.
 *
 * `tx` es opcional: sin ella usa el cliente raíz (un solo INSERT, atómico).
 * Devuelve { venta, creada }. Lanza 404 PEDIDO_NO_ENCONTRADO o 409
 * PEDIDO_NO_CONFIRMADO { estado }.
 */
async function registrarVentaDePedido(pedidoId, { responsableId = null } = {}, tx) {
  const pedido = await ventaRepository.obtenerPedidoParaVenta(pedidoId, { tx });

  if (!pedido) {
    throw new PedidoNoEncontradoError();
  }

  if (!ESTADOS_QUE_CUENTAN.includes(pedido.estado)) {
    throw new PedidoNoConfirmadoError(pedido.estado);
  }

  const existente = await ventaRepository.buscarPorPedido(pedidoId, { tx });
  if (existente) {
    return { venta: existente, creada: false };
  }

  try {
    const venta = await ventaRepository.crear(
      {
        pedidoId,
        clienteId: pedido.usuarioId,
        responsableId,
        subtotal: pedido.subtotal,
        costoEnvio: pedido.costoEnvio,
        total: pedido.total,
        metodoPago: pedido.metodoPago,
      },
      { tx }
    );

    return { venta, creada: true };
  } catch (error) {
    if (!esUniqueDePedido(error)) throw error;

    // Otro la registró entre la búsqueda y el alta. En MySQL/InnoDB un
    // duplicado no aborta la transacción en curso, pero dentro de ella una
    // lectura común devolvería la foto vieja (sin la venta recién confirmada):
    // se relee CON lock para ver el valor vigente. Si no aparece, es un error
    // real y se propaga el original.
    const registrada = await ventaRepository.buscarPorPedido(pedidoId, { tx, bloquear: true });
    if (!registrada) throw error;

    return { venta: registrada, creada: false };
  }
}

/**
 * Anula la venta de un pedido (REGISTRADA -> ANULADA con `anuladaEn`). Nunca la
 * borra. IDEMPOTENTE: anular una venta ya anulada, o la de un pedido que nunca
 * tuvo venta (se canceló antes de confirmarse), no es un error: devuelve
 * { anulada: false }.
 *
 * `anuladaPorId` es quien ANULA (el admin/vendedor que cancela el pedido) y se
 * guarda en `Venta.anuladaPorId` junto con `anuladaEn`; puede ser null (una
 * anulación sin usuario, p. ej. un proceso automático futuro). NO es
 * `Venta.responsableId`, que sigue siendo quien la REGISTRÓ y no se pisa. Una
 * segunda anulación no sobrescribe ni la fecha ni quién anuló primero.
 */
async function anularVentaDePedido(pedidoId, { anuladaPorId = null } = {}, tx) {
  const anuladas = await ventaRepository.anular(pedidoId, { tx, anuladaPorId });

  return { anulada: anuladas > 0 };
}

module.exports = {
  ESTADOS_QUE_CUENTAN,
  registrarVentaDePedido,
  anularVentaDePedido,
  PedidoNoEncontradoError,
  PedidoNoConfirmadoError,
};
