const express = require("express");
const router = express.Router();

const pedidoController = require("../controllers/pedido.controller");
const auth = require("../middlewares/auth");
const roleGuard = require("../middlewares/roleGuard");

// Sprint 4 / MOD-06 (DDS §3). Paths completos, como el resto de los route
// files:
//   POST  /api/v1/pedidos                 cliente (RF-030)

router.post("/api/v1/pedidos", auth, roleGuard(["cliente"]), pedidoController.crear);

module.exports = router;
