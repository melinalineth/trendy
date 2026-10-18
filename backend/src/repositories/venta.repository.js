// Sprint 5 / MOD-09 (DDS §3): acceso a datos de Venta (RF-041).
//
// Todas las funciones reciben un último parámetro opcional `{ tx }` (mismo
// patrón que inventario.repository.js): con `tx` escriben dentro de la MISMA
// transacción que cambia el estado del pedido; sin él usan el cliente único de
// config/prisma.js.
//
// Solo se puede leer, registrar y anular: no hay update ni delete, la
// información histórica de una venta no se modifica (RF-041, RN-008).
const prisma = require("../config/prisma");

// Pedido con lo mínimo para copiar la venta (RN-008: los montos se COPIAN, no
// se recalculan). Es una lectura CON LOCK (`FOR UPDATE`): lee siempre el valor
// vigente y no el de la foto de la transacción. InnoDB trabaja en REPEATABLE
// READ y una lectura común dentro de `tx` devuelve la foto tomada en la primera
// lectura de esa transacción, que puede ser anterior a un cambio ya confirmado
// por otro actor. Quien llama normalmente ya tiene tomado el lock del pedido
// (bloquearPedido): tomarlo de nuevo en la misma transacción no cuesta nada.
const obtenerPedidoParaVenta = async (pedidoId, { tx } = {}) => {
  const db = tx ?? prisma;

  const filas = await db.$queryRaw`
    SELECT id, usuarioId, subtotal, costoEnvio, total, metodoPago, estado
    FROM Pedido
    WHERE id = ${pedidoId}
    FOR UPDATE`;

  return filas[0] ?? null;
};

// Venta de un pedido (o null). Con `bloquear` es una lectura con lock sobre la
// fila de la venta (vigente, no la foto de la transacción): la necesita
// registrarVentaDePedido para releer la venta que otro acaba de confirmar.
const buscarPorPedido = async (pedidoId, { tx, bloquear = false } = {}) => {
  const db = tx ?? prisma;

  if (bloquear) {
    const filas = await db.$queryRaw`SELECT * FROM Venta WHERE pedidoId = ${pedidoId} FOR UPDATE`;
    return filas[0] ?? null;
  }

  return db.venta.findUnique({
    where: { pedidoId },
  });
};

// `clienteId` es el `usuarioId` del pedido. `responsableId` es NULL cuando la
// dispara el webhook de Mercado Pago (no hay usuario). El unique de `pedidoId`
// hace que una segunda venta del mismo pedido falle con P2002.
const crear = async (
  { pedidoId, clienteId, responsableId = null, subtotal, costoEnvio, total, metodoPago },
  { tx } = {}
) => {
  const db = tx ?? prisma;

  return db.venta.create({
    data: {
      pedidoId,
      clienteId,
      responsableId,
      subtotal,
      costoEnvio,
      total,
      metodoPago,
    },
  });
};

// REGISTRADA -> ANULADA con `anuladaEn` y `anuladaPorId` (quien anula: puede ser
// null si la anulación no tiene usuario; NO es `responsableId`, que sigue siendo
// quien registró la venta). Devuelve cuántas ventas anuló (0 o 1).
// `updateMany` a propósito: si el pedido no tiene venta o ya está anulada es un
// no-op en vez de un error (idempotente) y no pisa la primera `anuladaEn` ni el
// primer `anuladaPorId`: los tres campos se escriben en la MISMA sentencia, con
// la guarda `estado: REGISTRADA`.
const anular = async (pedidoId, { tx, anuladaPorId = null } = {}) => {
  const db = tx ?? prisma;

  const resultado = await db.venta.updateMany({
    where: {
      pedidoId,
      estado: "REGISTRADA",
    },
    data: {
      estado: "ANULADA",
      anuladaEn: new Date(),
      anuladaPorId,
    },
  });

  return resultado.count;
};

module.exports = {
  obtenerPedidoParaVenta,
  buscarPorPedido,
  crear,
  anular,
};
