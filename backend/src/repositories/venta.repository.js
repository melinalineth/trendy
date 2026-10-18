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

// REGISTRADA -> ANULADA con `anuladaEn`. Devuelve cuántas ventas anuló (0 o 1).
// `updateMany` a propósito: si el pedido no tiene venta o ya está anulada es un
// no-op en vez de un error (idempotente) y no pisa la primera `anuladaEn`.
const anular = async (pedidoId, { tx } = {}) => {
  const db = tx ?? prisma;

  const resultado = await db.venta.updateMany({
    where: {
      pedidoId,
      estado: "REGISTRADA",
    },
    data: {
      estado: "ANULADA",
      anuladaEn: new Date(),
    },
  });

  return resultado.count;
};

// ---------------------------------------------------------------------------
// --- Consulta (RF-042) ---
// ---------------------------------------------------------------------------
// Funciones de LECTURA para GET /api/v1/ventas (docs/diseno/ventas-api.md).
// No usan `tx`: son consultas independientes de solo lectura.

// Solo id y nombre de las personas: jamás correo ni passwordHash.
const PERSONA_PUBLICA = { select: { id: true, nombre: true } };

// Una sola consulta (con sus relaciones resueltas por Prisma en lotes, sin N+1)
// trae todo lo que muestra el listado. Los montos de las líneas son los
// HISTÓRICOS de DetallePedido (RN-008); el nombre, sku, talla y color salen de
// la variante y el producto (DetallePedido no guarda una copia de esos textos).
const SELECT_LISTADO = {
  id: true,
  pedidoId: true,
  subtotal: true,
  costoEnvio: true,
  total: true,
  metodoPago: true,
  estado: true,
  registradaEn: true,
  anuladaEn: true,
  cliente: PERSONA_PUBLICA,
  responsable: PERSONA_PUBLICA,
  pedido: {
    select: {
      numero: true,
      estado: true,
      detalles: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          cantidad: true,
          precioUnitario: true,
          variante: {
            select: {
              sku: true,
              talla: true,
              color: true,
              producto: { select: { nombre: true } },
            },
          },
        },
      },
    },
  },
};

// Rango de `registradaEn`: `desde` inclusivo y `hastaExclusivo` exclusivo (la
// medianoche de Bogotá del día siguiente al `hasta` del usuario). Ya resueltos
// como Date por el DTO.
function construirRango({ desde, hastaExclusivo } = {}) {
  if (!desde && !hastaExclusivo) return {};

  return {
    registradaEn: {
      ...(desde ? { gte: desde } : {}),
      ...(hastaExclusivo ? { lt: hastaExclusivo } : {}),
    },
  };
}

// Filtro del listado y del conteo: rango de fechas + estado opcional.
function construirFiltro({ estado, ...rango } = {}) {
  return {
    ...construirRango(rango),
    ...(estado ? { estado } : {}),
  };
}

// Página de ventas, la más reciente primero (id desempata). Devuelve las filas
// tal cual las entrega Prisma (Decimal y Date); el service las presenta.
const listar = async ({ skip = 0, take = 50, ...filtros } = {}) => {
  return await prisma.venta.findMany({
    where: construirFiltro(filtros),
    orderBy: [{ registradaEn: "desc" }, { id: "desc" }],
    skip,
    take,
    select: SELECT_LISTADO,
  });
};

// Cantidad de ventas que cumplen los mismos filtros que `listar` (sin página).
const contar = async (filtros = {}) => {
  return await prisma.venta.count({ where: construirFiltro(filtros) });
};

// Consolidado del período por estado: { REGISTRADA: { cantidad, total },
// ANULADA: { cantidad, total } } con `total` como texto de dos decimales
// (Decimal exacto, nunca float). Cubre TODAS las ventas del rango de fechas y
// IGNORA el filtro `estado` y la página: así las dos tarjetas siempre muestran
// el consolidado del período. Sin ventas devuelve ceros.
const totalesPorEstado = async (filtros = {}) => {
  const grupos = await prisma.venta.groupBy({
    by: ["estado"],
    where: construirRango(filtros),
    _count: { _all: true },
    _sum: { total: true },
  });

  const totales = {
    REGISTRADA: { cantidad: 0, total: "0.00" },
    ANULADA: { cantidad: 0, total: "0.00" },
  };

  for (const grupo of grupos) {
    totales[grupo.estado] = {
      cantidad: grupo._count._all,
      total: grupo._sum.total ? grupo._sum.total.toFixed(2) : "0.00",
    };
  }

  return totales;
};

// --- Fin Consulta (RF-042) ---

module.exports = {
  obtenerPedidoParaVenta,
  buscarPorPedido,
  crear,
  anular,
  listar,
  contar,
  totalesPorEstado,
};
