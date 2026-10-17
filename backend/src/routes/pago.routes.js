const express = require("express");
const router = express.Router();

const pagoController = require("../controllers/pago.controller");
const auth = require("../middlewares/auth");
const roleGuard = require("../middlewares/roleGuard");

// Sprint 4 / MOD-07 (DDS §3). Paths completos, como el resto de los route
// files:
//   POST  /api/v1/pagos/mercadopago/preferencia   cliente (dueño del pedido)
//   POST  /api/v1/pagos/mercadopago/webhook       público, validado por firma
//   POST  /api/v1/pagos/contra-entrega            cliente (dueño del pedido)
//   GET   /api/v1/pedidos/:id/pago                cliente dueño, admin, vendedor
//   PATCH /api/v1/pagos/:pedidoId/confirmar-recepcion  admin, vendedor
// El último no está en la tabla del DDS: es la adición de la tarjeta
// "[Sprint 4 - 05] [02]" para el criterio de RF-037 "el vendedor o
// administrador podrá registrar posteriormente la recepción del pago".

router.post(
  "/api/v1/pagos/mercadopago/preferencia",
  auth,
  roleGuard(["cliente"]),
  pagoController.crearPreferencia
);

// SIN auth: Mercado Pago llama directo, sin JWT (auth.js no se aplica
// globalmente en app.js).
router.post("/api/v1/pagos/mercadopago/webhook", pagoController.recibirWebhook);

router.post(
  "/api/v1/pagos/contra-entrega",
  auth,
  roleGuard(["cliente"]),
  pagoController.registrarContraEntrega
);

router.get(
  "/api/v1/pedidos/:id/pago",
  auth,
  roleGuard(["cliente", "admin", "vendedor"]),
  pagoController.consultarEstadoPago
);

router.patch(
  "/api/v1/pagos/:pedidoId/confirmar-recepcion",
  auth,
  roleGuard(["admin", "vendedor"]),
  pagoController.confirmarRecepcion
);

module.exports = router;
