const pedidoService = require("../services/pedido.service");
const { validarCrearPedido } = require("../dtos/pedido.dto");

// Sprint 4 / MOD-06 (DDS §3): pedidos. Los roles se restringen en
// pedido.routes.js (roleGuard). Sin try/catch: Express 5 reenvía las
// rejections async a errorHandler.js, que responde
// { error: { codigo, mensaje, detalles } } (DDS §5.3) con el status y el
// código que trae cada error de dominio (mismo patrón que pago.controller).
// RN-003: el usuario sale SIEMPRE de req.usuario (JWT verificado por auth.js),
// nunca del body.

/**
 * POST /api/v1/pedidos
 * Crea un pedido para el cliente autenticado a partir de su carrito.
 */
async function crear(req, res) {
  const datos = validarCrearPedido(req.body);

  const pedido = await pedidoService.crearPedido(req.usuario.id, datos);

  return res.status(201).json({
    mensaje: "Pedido creado correctamente",
    pedido,
  });
}

module.exports = {
  crear,
};
