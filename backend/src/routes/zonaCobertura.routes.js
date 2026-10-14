const express = require("express");
const router = express.Router();

const zonaController = require("../controllers/zonaCobertura.controller");
const auth = require("../middlewares/auth");
const roleGuard = require("../middlewares/roleGuard");

// RF-026 / DDS §3 MOD-05: administración de zonas de cobertura y tarifas de
// envío, solo para el administrador. El DDS define GET y POST de
// /api/v1/zonas-cobertura; RF-026 también pide modificar, activar y
// desactivar, por eso se suman PUT .../:id/tarifa (cambiar la tarifa) y
// PATCH .../:id/estado (activar/desactivar la zona).

router.get("/api/v1/zonas-cobertura", auth, roleGuard(["admin"]), zonaController.listar);

router.post("/api/v1/zonas-cobertura", auth, roleGuard(["admin"]), zonaController.crear);

router.put(
  "/api/v1/zonas-cobertura/:id/tarifa",
  auth,
  roleGuard(["admin"]),
  zonaController.cambiarTarifa
);

router.patch(
  "/api/v1/zonas-cobertura/:id/estado",
  auth,
  roleGuard(["admin"]),
  zonaController.cambiarEstado
);

module.exports = router;
