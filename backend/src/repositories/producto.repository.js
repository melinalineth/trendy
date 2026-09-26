const prisma = require("../config/prisma");

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

  // RF-012: detalle de producto (MOD-02). A diferencia de `buscar`, acá
  // traemos TODAS las variantes (incluso con stock 0) porque el detalle
  // tiene que poder mostrar tallas/colores agotados — es el service el que
  // decide, por variante, si está `disponible`.
  async obtenerPorId(id) {
    return prisma.producto.findUnique({
      where: { id },
      include: {
        variantes: true,
        imagenes: true,
        categoria: true,
      },
    });
  },

  // RF-013: alta de producto por admin/vendedor. `datos` ya viene validado
  // por crearProductoSchema (producto.dto.js) y filtrado/reforzado por
  // producto.service — este repository no agrega lógica, solo persiste.
  async crear(datos) {
    return prisma.producto.create({ data: datos });
  },

  // RF-013: edición parcial (PUT admite campos opcionales, ver
  // actualizarProductoSchema). El caller (producto.service) es responsable
  // de confirmar que el producto exista antes de llamar acá.
  async actualizar(id, datos) {
    return prisma.producto.update({ where: { id }, data: datos });
  },

  // RF-013: cambio de estado (ACTIVO/INACTIVO) separado de `actualizar`
  // para que la validación de "no se puede activar sin imagen" (ver
  // producto.service.cambiarEstado) tenga un punto de entrada propio, igual
  // que vendedor.service.cambiarEstado tiene el suyo para EstadoUsuario.
  async cambiarEstado(id, estado) {
    return prisma.producto.update({ where: { id }, data: { estado } });
  },
};

module.exports = productoRepository;