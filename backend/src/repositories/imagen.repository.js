const prisma = require("../config/prisma");

// RF-014: gestión de imágenes de un producto.
const imagenRepository = {
  async crear(productoId, url, orden) {
    return prisma.imagen.create({
      data: { productoId, url, orden },
    });
  },

  async listarPorProducto(productoId) {
    return prisma.imagen.findMany({
      where: { productoId },
      orderBy: { orden: "asc" },
    });
  },
};

module.exports = imagenRepository;
