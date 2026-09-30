const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const carritoRepository = {
  // ==========================================
  // MÉTODOS EXISTENTES — NO MODIFICAR
  // ==========================================

  // obtenerOCrear(...)
  // agregarItem(...)


  // ==========================================
  // NUEVOS MÉTODOS
  // ==========================================

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