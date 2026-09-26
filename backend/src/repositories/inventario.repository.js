const prisma = require("../config/prisma");

// RF-017: RN-002 dice que el stock nunca puede quedar negativo, pero el
// campo Variante.stock no tiene un CHECK a nivel de columna (Prisma/MySQL no
// modelan eso limpiamente vía schema.prisma) — la regla se hace cumplir acá,
// leyendo el stock actual DENTRO de la misma transacción que lo actualiza,
// para evitar una condición de carrera entre el "leer stock" y el
// "escribir stock" si dos ajustes llegan casi al mismo tiempo para la misma
// variante.
//
// Dos errores de dominio separados (mismo criterio que
// ProductoNoEncontradoError/VarianteDuplicadaError en variante.service.js):
// que la variante no exista es un 404, que el ajuste deje el stock en
// negativo es un 409 — son causas distintas y el controller necesita
// distinguirlas.
class VarianteNoEncontradaError extends Error {}
class StockInsuficienteError extends Error {}

const inventarioRepository = {
  // (a) lee el stock actual de la variante, (b) si stockActual + cantidad
  // queda negativo aborta con un error de dominio (no deja que la DB
  // truene con algo genérico), (c) crea el InventarioMovimiento, (d)
  // actualiza Variante.stock — todo dentro de una única transacción para
  // que un fallo en cualquier paso revierta los anteriores.
  async registrarAjuste(varianteId, cantidad, tipoAjuste, motivo, usuarioId) {
    return prisma.$transaction(async (tx) => {
      const variante = await tx.variante.findUnique({
        where: { id: varianteId },
      });

      if (!variante) {
        throw new VarianteNoEncontradaError("La variante no existe");
      }

      const stockResultante = variante.stock + cantidad;

      if (stockResultante < 0) {
        throw new StockInsuficienteError(
          "El ajuste dejaría el stock en negativo"
        );
      }

      const movimiento = await tx.inventarioMovimiento.create({
        data: {
          varianteId,
          cantidad,
          tipoAjuste,
          motivo: motivo ?? null,
          usuarioId,
        },
      });

      const varianteActualizada = await tx.variante.update({
        where: { id: varianteId },
        data: { stock: stockResultante },
      });

      return { movimiento, variante: varianteActualizada };
    });
  },

  // Historial de movimientos de UNA variante, más reciente primero. Incluye
  // el usuario que hizo cada ajuste (columna "Usuario" del historial en el
  // panel de inventario).
  async listarPorVariante(varianteId) {
    return prisma.inventarioMovimiento.findMany({
      where: { varianteId },
      include: { usuario: true },
      orderBy: { creadoEn: "desc" },
    });
  },

  // Vista general de RF-017: una fila por VARIANTE (no por movimiento) con
  // su stock actual, que es lo que el panel de inventario necesita listar y
  // sobre lo que se dispara "Ajustar stock"/"Ver historial" (usando el id de
  // la variante, no el de un movimiento).
  async listarTodo() {
    return prisma.variante.findMany({
      include: { producto: { select: { id: true, nombre: true } } },
      orderBy: { id: "asc" },
    });
  },
};

module.exports = inventarioRepository;
module.exports.VarianteNoEncontradaError = VarianteNoEncontradaError;
module.exports.StockInsuficienteError = StockInsuficienteError;
