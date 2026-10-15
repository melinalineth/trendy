const pedidoService = require("../services/pedido.service");
const {
  validarCrearPedido,
  validarCancelarVencidos,
  validarListarPedidos,
  validarActualizarEstado,
  validarActualizarEstadoEnvio,
} = require("../dtos/pedido.dto");
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
 * GET /api/v1/pedidos
 * Cliente: solo sus pedidos (el filtro sale de la sesión, nunca de la query).
 * Admin/vendedor: consulta general con filtros (?estado, ?numero, ?usuarioId,
 * ?desde, ?hasta) y paginación (?pagina, ?limite).
 */
async function listar(req, res) {
  const filtros = validarListarPedidos(req.query);

  const resultado = await pedidoService.listarPedidos(req.usuario, filtros);

  return res.status(200).json(resultado);
}

/**
 * GET /api/v1/pedidos/:id
 * Un cliente no puede consultar pedidos ajenos: responde 404 como si no
 * existiera (RN-003).
 */
async function obtenerPorId(req, res) {
  const id = validarPedidoIdParam(req.params.id);

  const pedido = await pedidoService.obtenerPedidoPorId(id, req.usuario);

  return res.status(200).json(pedido);
}

/**
 * PATCH /api/v1/pedidos/:id/estado
 * Solo admin/vendedor (roleGuard en las rutas). La transición la valida el
 * service con la tabla de docs/diseno/pedidos-estados.md.
 */
async function actualizarEstado(req, res) {
  const id = validarPedidoIdParam(req.params.id);
  const { estado } = validarActualizarEstado(req.body);

  const pedido = await pedidoService.actualizarEstado(id, estado);

  return res.status(200).json({
    mensaje: "Estado del pedido actualizado correctamente",
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

/**
 * PUT /api/v1/pedidos/:id/estado-envio (admin/vendedor, RF-029)
 * Avanza el envío un paso y sincroniza el estado del pedido. Responde el
 * seguimiento actualizado.
 */
async function actualizarEstadoEnvio(req, res) {
  const id = validarPedidoIdParam(req.params.id);
  const { estadoEnvio } = validarActualizarEstadoEnvio(req.body);

  const seguimiento = await pedidoService.actualizarEstadoEnvio(id, estadoEnvio);

  return res.status(200).json(seguimiento);
}

/**
 * GET /api/v1/pedidos/:id/seguimiento (RF-028)
 * Dueño, admin y vendedor; un pedido ajeno responde 404.
 */
async function seguimiento(req, res) {
  const id = validarPedidoIdParam(req.params.id);

  const resultado = await pedidoService.obtenerSeguimiento(id, req.usuario);

  return res.status(200).json(resultado);
}

module.exports = {
  crear,
  actualizarEstadoEnvio,
  seguimiento,
  listar,
  obtenerPorId,
  actualizarEstado,
  cancelar,
  cancelarVencidos,
};
