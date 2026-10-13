
const express = require("express");
const router = express.Router();

const pagoController = require("../controllers/pago.controller");
const auth = require("../middlewares/auth");
const roleGuard = require("../middlewares/roleGuard");

// Registrar pago contra entrega
router.post(
  "/contra-entrega",
  auth,
  pagoController.registrarContraEntrega
);

// Consultar el pago de un pedido
router.get(
  "/pedidos/:id/pago",
  auth,
  pagoController.obtenerPagoPorPedido
);

// Confirmar recepción del pago (admin/vendedor)
router.patch(
  "/:pedidoId/confirmar-recepcion",
  auth,
  roleGuard(["admin", "vendedor"]),
  pagoController.confirmarRecepcion
);

module.exports = router;
