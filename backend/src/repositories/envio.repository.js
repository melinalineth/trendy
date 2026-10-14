const prisma = require("../config/prisma");

const envioRepository = {
  /**
   * Busca una zona de cobertura activa por ciudad y departamento
   * y obtiene su tarifa de envío activa.
   *
   * `estado` es el enum EstadoProducto en ZonaCobertura y TarifaEnvio
   * ("ACTIVO" = activa), igual que en Categoria.
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
