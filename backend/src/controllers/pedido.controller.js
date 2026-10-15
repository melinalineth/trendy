const pedidoService = require("../services/pedido.service");
const { validarCrearPedido, validarCancelarVencidos } = require("../dtos/pedido.dto");
const { validarPedidoIdParam } = require("../dtos/pago.dto");

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

/**
 * PATCH /api/v1/pedidos/:id/cancelar
 * Cliente: solo sus pedidos (uno ajeno responde 404). Admin/vendedor:
 * cualquiera. Repone el stock una sola vez; repetirlo responde 200 con
 * `yaCancelado: true`.
 */
async function cancelar(req, res) {
  const id = validarPedidoIdParam(req.params.id);

  const { pedido, yaCancelado } = await pedidoService.cancelarPedido(id, req.usuario);

  return res.status(200).json({
    mensaje: yaCancelado ? "El pedido ya estaba cancelado" : "Pedido cancelado correctamente",
    yaCancelado,
    pedido,
  });
}

/**
 * POST /api/v1/pedidos/vencidos/cancelar (admin)
 * Cancela los pedidos de Mercado Pago sin pagar más viejos que `horas`.
 * Pensado para que lo invoque un scheduler externo.
 */
async function cancelarVencidos(req, res) {
  const { horas } = validarCancelarVencidos(req.body);

  const resultado = await pedidoService.cancelarPedidosVencidos({ horas });

  return res.status(200).json(resultado);
}

module.exports = {
  crear,
  cancelar,
  cancelarVencidos,
};
