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

  /**
   * Sprint 4 / RF-027: crea el InfoEnvio de un pedido. `estadoEnvio` no
   * tiene default en el schema: el alta lo setea explícitamente en
   * EN_PREPARACION (docs/diseno/info-envio.md). `client` es la transacción
   * que crea el pedido (pedido e InfoEnvio confirman o revierten juntos).
   */
  async crearInfoEnvio({ pedidoId, direccionId, costoEnvio }, client = prisma) {
    return client.infoEnvio.create({
      data: {
        pedidoId,
        direccionId,
        costoEnvio,
        estadoEnvio: "EN_PREPARACION",
      },
    });
  },
};

module.exports = envioRepository;
