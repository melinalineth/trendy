const express = require("express");
const router = express.Router();

const pedidoController = require("../controllers/pedido.controller");
const auth = require("../middlewares/auth");
const roleGuard = require("../middlewares/roleGuard");

// Sprint 4 / MOD-06 (DDS §3). Paths completos, como el resto de los route
// files. Las rutas fijas (/vencidos/cancelar) van ANTES de las que llevan
// :id.
//   POST  /api/v1/pedidos                    cliente (RF-030)
//   POST  /api/v1/pedidos/vencidos/cancelar  admin (scheduler externo)
//   PATCH /api/v1/pedidos/:id/cancelar       cliente dueño, admin, vendedor

router.post("/api/v1/pedidos", auth, roleGuard(["cliente"]), pedidoController.crear);

router.post(
  "/api/v1/pedidos/vencidos/cancelar",
  auth,
  roleGuard(["admin"]),
  pedidoController.cancelarVencidos
);

router.patch(
  "/api/v1/pedidos/:id/cancelar",
  auth,
  roleGuard(["cliente", "admin", "vendedor"]),
  pedidoController.cancelar
);

module.exports = router;
