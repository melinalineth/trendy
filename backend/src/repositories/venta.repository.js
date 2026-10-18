const prisma = require("../config/prisma");

// Sprint 5 / MOD-09 (RF-042).
//
// NOTA DE INTEGRACIÓN: este archivo agrupa las funciones de LECTURA de ventas
// (consulta). Las de escritura (registro y anulación, RF-041) viven en una
// sección propia aparte; no mezclar.

// ---------------------------------------------------------------------------
// --- Consulta (RF-042) ---
// ---------------------------------------------------------------------------

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
  listar,
  contar,
  totalesPorEstado,
};
