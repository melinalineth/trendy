const express = require("express");
const router = express.Router();

const envioController = require("../controllers/envio.controller");
const auth = require("../middlewares/auth");

// Obtener tarifa de envío para una dirección
router.get("/tarifa", auth, envioController.obtenerTarifa);

module.exports = router;