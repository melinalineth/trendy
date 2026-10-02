const prisma = require("../config/prisma");

const carritoRepository = {
  /**
   * Devuelve el carrito del usuario; si todavía no tiene, lo crea.
   * Carrito.usuarioId es @unique, por eso se puede buscar con findUnique.
   */
  async obtenerOCrear(usuarioId) {
    const id = Number(usuarioId);

    let carrito = await prisma.carrito.findUnique({
      where: {
        usuarioId: id,
      },
    });

    if (!carrito) {
      carrito = await prisma.carrito.create({
        data: {
          usuarioId: id,
        },
      });
    }

    return carrito;
  },

  /**
   * Agrega una variante al carrito. ItemCarrito tiene
   * @@unique([carritoId, varianteId]), así que si la variante ya estaba en el
   * carrito se suma la cantidad en vez de intentar crear un duplicado (que
   * fallaría por la restricción de unicidad).
   */
  async agregarItem(carritoId, varianteId, cantidad) {
    const idCarrito = Number(carritoId);
    const idVariante = Number(varianteId);
    const cant = Number(cantidad);

    return prisma.itemCarrito.upsert({
      where: {
        carritoId_varianteId: {
          carritoId: idCarrito,
          varianteId: idVariante,
        },
      },
      update: {
        cantidad: {
          increment: cant,
        },
      },
      create: {
        carritoId: idCarrito,
        varianteId: idVariante,
        cantidad: cant,
      },
    });
  },

  /**
   * Actualiza la cantidad de un item del carrito.
   */
  async actualizarCantidad(itemId, cantidad) {
    return prisma.itemCarrito.update({
      where: {
        id: Number(itemId),
      },
      data: {
        cantidad: Number(cantidad),
      },
    });
  },

  /**
   * Elimina un item del carrito.
   */
  async eliminarItem(itemId) {
    return prisma.itemCarrito.delete({
      where: {
        id: Number(itemId),
      },
    });
  },

  /**
   * Obtiene el carrito junto con sus items,
   * variantes y productos para calcular el resumen.
   */
  async obtenerConItems(carritoId) {
    return prisma.carrito.findUnique({
      where: {
        id: Number(carritoId),
      },
      include: {
        items: {
          include: {
            variante: {
              include: {
                producto: true,
              },
            },
          },
        },
      },
    });
  },
};

module.exports = carritoRepository;
