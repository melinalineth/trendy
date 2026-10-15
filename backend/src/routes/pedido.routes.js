const express = require("express");
const router = express.Router();

const pedidoController = require("../controllers/pedido.controller");
const auth = require("../middlewares/auth");
const roleGuard = require("../middlewares/roleGuard");

// Sprint 4 / MOD-06 (DDS §3). Paths completos, como el resto de los route
// files. Las rutas fijas (/vencidos/cancelar) van ANTES de las que llevan
// :id.
//   POST  /api/v1/pedidos                    cliente (RF-030)
//   GET   /api/v1/pedidos                    cliente (propios), admin, vendedor (RF-031, RF-032)
//   POST  /api/v1/pedidos/vencidos/cancelar  admin (scheduler externo)
//   GET   /api/v1/pedidos/:id                cliente dueño, admin, vendedor (RF-031)
//   PATCH /api/v1/pedidos/:id/estado         admin, vendedor (RF-032)
//   PATCH /api/v1/pedidos/:id/cancelar       cliente dueño, admin, vendedor
// (GET /api/v1/pedidos/:id/pago vive en pago.routes.js.)

router.post("/api/v1/pedidos", auth, roleGuard(["cliente"]), pedidoController.crear);

router.get(
  "/api/v1/pedidos",
  auth,
  roleGuard(["cliente", "admin", "vendedor"]),
  pedidoController.listar
);

router.post(
  "/api/v1/pedidos/vencidos/cancelar",
  auth,
  roleGuard(["admin"]),
  pedidoController.cancelarVencidos
);

router.get(
  "/api/v1/pedidos/:id",
  auth,
  roleGuard(["cliente", "admin", "vendedor"]),
  pedidoController.obtenerPorId
);

router.patch(
  "/api/v1/pedidos/:id/estado",
  auth,
  roleGuard(["admin", "vendedor"]),
  pedidoController.actualizarEstado
);

router.patch(
  "/api/v1/pedidos/:id/cancelar",
  auth,
  roleGuard(["cliente", "admin", "vendedor"]),
  pedidoController.cancelar
);

module.exports = router;
