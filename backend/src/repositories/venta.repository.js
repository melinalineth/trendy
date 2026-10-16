const prisma = require("../config/prisma");

/**
 * Construye los filtros de búsqueda de ventas.
 * Solo agrega las condiciones que estén definidas.
 */
const armarWhere = ({ desde, hastaExclusivo, estado } = {}) => {
  const where = {};

  if (desde !== undefined || hastaExclusivo !== undefined) {
    where.registradaEn = {};

    if (desde !== undefined) {
      where.registradaEn.gte = desde;
    }

    if (hastaExclusivo !== undefined) {
      where.registradaEn.lt = hastaExclusivo;
    }
  }

  if (estado !== undefined) {
    where.estado = estado;
  }

  return where;
};

/**
 * Lista ventas con paginación y orden estable.
 */
const listar = async (filtros = {}, { skip, take } = {}) => {
  return prisma.venta.findMany({
    where: armarWhere(filtros),
    orderBy: [
      { registradaEn: "desc" },
      { id: "desc" },
    ],
    skip,
    take,
    select: {
      id: true,
      estado: true,
      registradaEn: true,
      anuladaEn: true,
      subtotal: true,
      costoEnvio: true,
      total: true,
      metodoPago: true,

      cliente: {
        select: {
          id: true,
          nombre: true,
        },
      },

      responsable: {
        select: {
          id: true,
          nombre: true,
        },
      },

      pedido: {
        select: {
          id: true,
          numero: true,
          estado: true,
          detalles: {
            select: {
              id: true,
              cantidad: true,
              precioUnitario: true,
              variante: {
                select: {
                  sku: true,
                  talla: true,
                  color: true,
                  producto: {
                    select: {
                      nombre: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
};

/**
 * Cuenta las ventas que coinciden con los filtros.
 */
const contar = async (filtros = {}) => {
  return prisma.venta.count({
    where: armarWhere(filtros),
  });
};

/**
 * Agrupa ventas por estado y calcula cantidad y suma total.
 * Los Decimal se convierten a número en el service.
 */
const totalesPorEstado = async (filtros = {}) => {
  return prisma.venta.groupBy({
    by: ["estado"],
    where: armarWhere(filtros),
    _count: {
      _all: true,
    },
    _sum: {
      total: true,
    },
  });
};

// Conserva aquí las exportaciones anteriores del repositorio.
module.exports = {
  // ...métodos existentes
  listar,
  contar,
  totalesPorEstado,
};