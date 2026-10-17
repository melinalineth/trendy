const pagoService = require("../services/pago.service");
const {
  validarPreferenciaMercadoPago,
  validarPagoContraEntrega,
  validarWebhookMercadoPago,
  validarPedidoIdParam,
} = require("../dtos/pago.dto");

// Sprint 4 / MOD-07 (DDS §3): pagos con Mercado Pago y contra entrega. Los
// roles se restringen en pago.routes.js (roleGuard). Los errores (400 de
// validación, 404/409 de dominio, 401 de firma, 502 de la pasarela) se
// propagan con throw: Express 5 reenvía las rejections async a
// errorHandler.js, que responde { error: { codigo, mensaje, detalles } }
// (DDS §5.3). RN-003: el usuario sale SIEMPRE de req.usuario (JWT verificado
// por auth.js), nunca del body.

// POST /api/v1/pagos/mercadopago/preferencia (RF-034)
async function crearPreferencia(req, res) {
  const { pedidoId } = validarPreferenciaMercadoPago(req.body);

  const resultado = await pagoService.crearPreferencia(pedidoId, req.usuario.id);

  return res.status(200).json(resultado);
}

// `data.id` de la QUERY STRING (`?data.id=123`): según la documentación de
// Mercado Pago, es el id que entra en el manifiesto de la firma
// (`id:<data.id>;request-id:...;ts:...;`). Express 5 usa el query parser
// "simple", que deja la clave literal `req.query["data.id"]`; si algún día se
// configurara "extended" (qs), llegaría anidada como `req.query.data.id`, así
// que se leen ambas. Un valor vacío, repetido (array) o que no sea string se
// ignora y el caller cae al body. Se devuelve recortado (trim) porque el
// WebhookSignatureValidator del SDK también recorta el data.id antes de armar
// el manifest: lo firmado y lo que se consulta con Payment.get son el mismo.
function dataIdDeLaQuery(query) {
  const candidatos = [query?.["data.id"], query?.data?.id];
  const valor = candidatos.find((c) => typeof c === "string" && c.trim() !== "");

  return valor?.trim();
}

// POST /api/v1/pagos/mercadopago/webhook (RF-035, RF-036). Público: lo llama
// Mercado Pago; la seguridad es la firma x-signature (se valida en el
// service). Responde 200 aunque el evento ya se haya procesado (RN-009):
// Mercado Pago reintenta mientras no reciba 200.
async function recibirWebhook(req, res) {
  const payload = validarWebhookMercadoPago(req.body);

  const firma = {
    xSignature: req.get("x-signature"),
    xRequestId: req.get("x-request-id"),
    // El id firmado (query) es el MISMO que el service consulta luego con
    // Payment.get: no se desacoplan. Respaldo: el del body.
    dataId: dataIdDeLaQuery(req.query) ?? payload.data?.id ?? "",
  };

  const resultado = await pagoService.procesarWebhook(payload, firma);

  return res.status(200).json(resultado);
}

// POST /api/v1/pagos/contra-entrega (RF-037)
async function registrarContraEntrega(req, res) {
  const { pedidoId } = validarPagoContraEntrega(req.body);

  const pago = await pagoService.registrarContraEntrega(pedidoId, req.usuario.id);

  return res.status(201).json(pago);
}

// GET /api/v1/pedidos/:id/pago (RF-038)
async function consultarEstadoPago(req, res) {
  const pedidoId = validarPedidoIdParam(req.params.id);

  const pago = await pagoService.consultarEstadoPago(pedidoId, req.usuario.id, req.usuario.rol);

  return res.status(200).json(pago);
}

// PATCH /api/v1/pagos/:pedidoId/confirmar-recepcion (RF-037, admin/vendedor)
async function confirmarRecepcion(req, res) {
  const pedidoId = validarPedidoIdParam(req.params.pedidoId);

  const pago = await pagoService.confirmarRecepcionContraEntrega(pedidoId);

  return res.status(200).json(pago);
}

module.exports = {
  crearPreferencia,
  recibirWebhook,
  registrarContraEntrega,
  consultarEstadoPago,
  confirmarRecepcion,
};
