import api from "./apiClient";

// Pedidos (Sprint 4, MOD-06 / MOD-05 del DDS). Contrato real en
// backend/src/routes/pedido.routes.js y docs/diseno/pedidos-estados.md.
// Todos los montos llegan como Number. Errores: { error: { codigo, mensaje,
// detalles } } (leerlos con obtenerErrorApi de services/apiError.js).

// POST /pedidos (cliente, RF-030). Crea el pedido a partir del CARRITO del
// usuario autenticado (el body no lleva líneas ni montos), descuenta el stock
// y vacía el carrito. Responde 201 { mensaje, pedido }.
// Errores: 400 VALIDACION_FALLIDA, 404 DIRECCION_NO_ENCONTRADA, 409
// CARRITO_VACIO / SIN_COBERTURA / CONTRA_ENTREGA_NO_DISPONIBLE /
// PRODUCTO_NO_DISPONIBLE { varianteId } / STOCK_INSUFICIENTE { varianteId,
// disponible } / MONTO_NO_ENTERO_COP (solo con Mercado Pago: un precio o el
// envío con centavos; se rechaza antes de reservar stock y el carrito queda
// intacto).
function crearPedido({ direccionId, metodoPago }) {
  return api
    .post("/pedidos", { direccionId, metodoPago })
    .then((response) => response.data);
}

// Filtros que acepta GET /pedidos. El backend rechaza parámetros
// desconocidos y valores vacíos (400), así que solo se mandan los que tienen
// valor.
const FILTROS_LISTADO = [
  "estado",
  "numero",
  "usuarioId",
  "desde",
  "hasta",
  "pagina",
  "limite",
];

function armarParams(filtros) {
  const params = {};

  FILTROS_LISTADO.forEach((clave) => {
    const valor = filtros[clave];
    const texto = typeof valor === "string" ? valor.trim() : valor;

    if (texto !== undefined && texto !== null && texto !== "") {
      params[clave] = texto;
    }
  });

  return params;
}

// GET /pedidos (RF-031 / RF-032). Un solo endpoint para los dos casos: el
// cliente recibe SOLO los suyos (el backend ignora `usuarioId`) y el personal
// (admin/vendedor) todos, con filtros. `desde`/`hasta` son AAAA-MM-DD en
// America/Bogota (`hasta` inclusivo); `limite` máximo 100.
// Responde { pedidos: [...], paginacion: { pagina, limite, total,
// totalPaginas } }. Cada pedido del listado trae `detalles` y `usuario`
// ({ id, nombre, correo }), pero NO `pago` ni `infoEnvio`: para eso está
// obtenerPorId.
function listarPedidos(filtros = {}) {
  return api
    .get("/pedidos", { params: armarParams(filtros) })
    .then((response) => response.data);
}

// GET /pedidos/:id (dueño, admin, vendedor; uno ajeno responde 404). Pedido
// sin envoltorio, con detalles (precio HISTÓRICO), dirección, infoEnvio y
// pago (o null).
function obtenerPorId(id) {
  return api.get(`/pedidos/${id}`).then((response) => response.data);
}

// GET /pedidos/:id/seguimiento (RF-028). { pedidoId, numero, estadoPedido,
// estadoEnvio, actualizadoEn, costoEnvio, direccion }. Todavía NO hay
// historial de cambios (docs/diseno/pedidos-estados.md §9).
function obtenerSeguimiento(id) {
  return api
    .get(`/pedidos/${id}/seguimiento`)
    .then((response) => response.data);
}

// PATCH /pedidos/:id/estado (admin, vendedor; RF-032). Solo transiciones de
// TRANSICIONES_PEDIDO (409 TRANSICION_ESTADO_INVALIDA / ENVIO_NO_REGISTRADO).
// Responde { mensaje, pedido }.
function actualizarEstado(id, estado) {
  return api
    .patch(`/pedidos/${id}/estado`, { estado })
    .then((response) => response.data);
}

// PATCH /pedidos/:id/cancelar (SOLO admin y vendedor: el cliente recibe 403).
// Repone el stock una sola vez. Responde { mensaje, yaCancelado, pedido };
// 409 PEDIDO_NO_CANCELABLE si ya avanzó o tiene un pago aprobado.
function cancelarPedido(id) {
  return api
    .patch(`/pedidos/${id}/cancelar`)
    .then((response) => response.data);
}

// PUT /pedidos/:id/estado-envio (admin, vendedor; RF-029). Avanza el envío un
// paso y sincroniza el estado del pedido. Responde el seguimiento
// actualizado. 409 TRANSICION_ENVIO_INVALIDA / ENVIO_NO_REGISTRADO.
function actualizarEstadoEnvio(id, estadoEnvio) {
  return api
    .put(`/pedidos/${id}/estado-envio`, { estadoEnvio })
    .then((response) => response.data);
}

// POST /pedidos/vencidos/cancelar (solo admin). Cancela, con reposición de
// stock, los pedidos de Mercado Pago pendientes cuya vigencia de pago venció.
// Sin body: el backend usa la vigencia configurada. Responde { horas, corte,
// cancelados: [ids], omitidos: [ids] }.
function cancelarVencidos() {
  return api
    .post("/pedidos/vencidos/cancelar", {})
    .then((response) => response.data);
}

const pedidoService = {
  crearPedido,
  listarPedidos,
  obtenerPorId,
  obtenerSeguimiento,
  actualizarEstado,
  cancelarPedido,
  actualizarEstadoEnvio,
  cancelarVencidos,
};

export default pedidoService;
