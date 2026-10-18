const express = require("express");
const router = express.Router();

const ventaController = require("../controllers/venta.controller");
const auth = require("../middlewares/auth");
const roleGuard = require("../middlewares/roleGuard");

// Sprint 5 / MOD-09 (RF-042). Paths completos, como el resto de los route
// files.
//   GET /api/v1/ventas   admin, vendedor (un cliente recibe 403)

router.get(
  "/api/v1/ventas",
  auth,
  roleGuard(["admin", "vendedor"]),
  ventaController.consultar
);

module.exports = router;
