const prisma = require("../config/prisma");

const envioRepository = {
  /**
   * Busca una zona de cobertura activa por ciudad y departamento
   * y obtiene su tarifa de envío activa.
   *
   * `estado` es Boolean en ZonaCobertura y TarifaEnvio (true = activa).
   * No se usa `mode: "insensitive"`: ese modificador solo existe en
   * PostgreSQL/MongoDB; en MySQL la comparación ya es case-insensitive por
   * la collation utf8mb4_unicode_ci de las tablas.
   */
  async buscarZonaPorDireccion(ciudad, departamento) {
    if (!ciudad || !departamento) {
      return null;
    }

    return prisma.zonaCobertura.findFirst({
      where: {
        ciudad: {
          equals: ciudad,
        },
        departamento: {
          equals: departamento,
        },
        estado: true,
      },
      include: {
        tarifas: {
          where: {
            estado: true,
          },
        },
      },
    });
  },
};

module.exports = envioRepository;
