const express = require("express");
const router = express.Router();

const ventaController = require("../controllers/venta.controller");
const auth = require("../middlewares/auth");

router.get(
  "/api/v1/ventas",
  auth,
  ventaController.listar
);

module.exports = router;