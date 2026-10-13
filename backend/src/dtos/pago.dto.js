const {
  validarPreferenciaMercadoPago,
  validarPagoContraEntrega,
} = require("../dtos/pago.dto");

// Mercado Pago
const { pedidoId } = validarPreferenciaMercadoPago(req.body);

// Contra entrega
const datos = validarPagoContraEntrega(req.body);