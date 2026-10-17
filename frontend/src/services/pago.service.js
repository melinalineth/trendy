import api from "./apiClient";

// Pagos (Sprint 4, MOD-07 del DDS). Contrato real en
// backend/src/routes/pago.routes.js. Errores: { error: { codigo, mensaje,
// detalles } } (leerlos con obtenerErrorApi de services/apiError.js).

// POST /pagos/mercadopago/preferencia (cliente dueño, RF-034). Responde
// { pedidoId, preferenciaId, checkoutUrl }: `checkoutUrl` es el checkout
// hospedado de Mercado Pago al que se redirige el navegador.
// Errores: 409 PEDIDO_VENCIDO / PEDIDO_NO_PENDIENTE / METODO_PAGO_NO_COINCIDE
// / TOTAL_INCONSISTENTE / MONTO_NO_ENTERO_COP (una línea o el envío con
// centavos: Mercado Pago solo acepta pesos enteros), 503
// CONFIGURACION_PAGOS_INCOMPLETA (sin credenciales
// de Mercado Pago), 502 PASARELA_NO_DISPONIBLE.
// OJO: la preferencia NO configura back_urls ni auto_return, así que Mercado
// Pago no devuelve al cliente a la tienda: el estado se consulta abriendo
// /pedidos/:id (el estado definitivo lo pone el webhook).
function crearPreferencia(pedidoId) {
  return api
    .post("/pagos/mercadopago/preferencia", { pedidoId })
    .then((response) => response.data);
}

// POST /pagos/contra-entrega (cliente dueño, RF-037). Registra el Pago en
// PENDIENTE hasta que el personal confirme la recepción; repetirlo devuelve
// el mismo pago. Responde 201 con el pago. 409 CONTRA_ENTREGA_NO_DISPONIBLE /
// METODO_PAGO_NO_COINCIDE / PEDIDO_NO_PENDIENTE.
function registrarContraEntrega(pedidoId) {
  return api
    .post("/pagos/contra-entrega", { pedidoId })
    .then((response) => response.data);
}

// GET /pedidos/:id/pago (dueño, admin, vendedor; RF-038). { id, pedidoId,
// metodo, estado, monto, referenciaExterna, actualizadoEn }; 404
// PAGO_NO_ENCONTRADO si el pedido todavía no tiene pago.
function consultarPago(pedidoId) {
  return api
    .get(`/pedidos/${pedidoId}/pago`)
    .then((response) => response.data);
}

// PATCH /pagos/:pedidoId/confirmar-recepcion (admin, vendedor; RF-037). Pasa
// el pago contra entrega de PENDIENTE a APROBADO (idempotente).
function confirmarRecepcion(pedidoId) {
  return api
    .patch(`/pagos/${pedidoId}/confirmar-recepcion`)
    .then((response) => response.data);
}

const pagoService = {
  crearPreferencia,
  registrarContraEntrega,
  consultarPago,
  confirmarRecepcion,
};

export default pagoService;
