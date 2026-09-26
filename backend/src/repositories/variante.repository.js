const prisma = require("../config/prisma");

// RF-016: alta de variantes (talla/color/SKU/stock) de un producto.
const varianteRepository = {
  async crear(productoId, datos) {
    return prisma.variante.create({
      data: { ...datos, productoId },
    });
  },
};

module.exports = varianteRepository;
