const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const envioRepository = {
  /**
   * Busca una zona de cobertura activa por ciudad y departamento
   * y obtiene su tarifa de envío activa.
   */
  async buscarZonaPorDireccion(ciudad, departamento) {
    if (!ciudad || !departamento) {
      return null;
    }

    return prisma.zonaCobertura.findFirst({
      where: {
        ciudad: {
          equals: ciudad,
          mode: "insensitive",
        },
        departamento: {
          equals: departamento,
          mode: "insensitive",
        },
        estado: "ACTIVO",
      },
      include: {
        tarifas: {
          where: {
            estado: "ACTIVO",
          },
        },
      },
    });
  },
};

module.exports = envioRepository;