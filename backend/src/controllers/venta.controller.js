const ventaService = require("../services/venta.service");
const { validarFiltrosVentas } = require("../dtos/venta.dto");

// Sprint 5 / MOD-09 (RF-042): consulta de ventas. Los roles se restringen en
// venta.routes.js (roleGuard). Sin try/catch: Express 5 reenvía las rejections
// async a errorHandler.js, que responde { error: { codigo, mensaje, detalles } }
// (DDS §5.3) con el status y el código que trae cada error (mismo patrón que
// pedido.controller).

/**
 * GET /api/v1/ventas
 * Admin y vendedor ven TODAS las ventas y los totales (v1.0). Filtros: ?desde,
 * ?hasta (YYYY-MM-DD inclusivos, hora de Bogotá), ?estado, ?pagina, ?limite.
 * Contrato completo en docs/diseno/ventas-api.md.
 */
async function consultar(req, res) {
  const filtros = validarFiltrosVentas(req.query);

  const resultado = await ventaService.consultar(filtros);

  return res.status(200).json(resultado);
}

module.exports = {
  consultar,
};
