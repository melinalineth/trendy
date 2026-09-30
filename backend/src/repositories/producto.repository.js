const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const productoRepository = {
  async buscar({
    categoria,
    talla,
    precioMin,
    precioMax,
    q,
  } = {}) {
    const where = {
      // RN-001: solo productos activos
      estado: "ACTIVO",

      // RN-001: debe tener al menos una variante disponible
      variantes: {
        some: {
          stock: {
            gt: 0,
          },
        },
      },
    };

    // Filtro por categoría
    if (categoria) {
      where.categoriaId = Number(categoria);
    }

    // Filtros combinados de variantes
    if (talla) {
      where.variantes = {
        some: {
          stock: {
            gt: 0,
          },
          talla: talla,
        },
      };
    }

    // Búsqueda por nombre o descripción
    if (q) {
      where.OR = [
        {
          nombre: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          descripcion: {
            contains: q,
            mode: "insensitive",
          },
        },
      ];
    }

    // Rango de precio
    if (precioMin !== undefined && precioMin !== "") {
      where.precio = {
        ...(where.precio || {}),
        gte: Number(precioMin),
      };
    }

    if (precioMax !== undefined && precioMax !== "") {
      where.precio = {
        ...(where.precio || {}),
        lte: Number(precioMax),
      };
    }

    return prisma.producto.findMany({
      where,

      include: {
        categoria: true,

        variantes: {
          where: {
            stock: {
              gt: 0,
            },
          },
        },

        imagenes: true,
      },

      orderBy: {
        id: "asc",
      },
    });
  },
};

module.exports = productoRepository;