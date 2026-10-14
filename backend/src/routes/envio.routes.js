const express = require("express");
const router = express.Router();

const envioController = require("../controllers/envio.controller");
const auth = require("../middlewares/auth");
const roleGuard = require("../middlewares/roleGuard");

// DDS §3 MOD-05: GET /api/v1/envios/tarifa?direccionId=. Es parte del flujo
// de compra del cliente (calcula el envío sobre SUS direcciones), por eso
// auth + roleGuard(["cliente"]).

// Obtener tarifa de envío para una dirección
router.get(
  "/api/v1/envios/tarifa",
  auth,
  roleGuard(["cliente"]),
  envioController.obtenerTarifa
);

module.exports = router;
