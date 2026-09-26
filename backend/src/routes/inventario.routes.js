const { Router } = require("express");
const inventarioController = require("../controllers/inventario.controller");
const auth = require("../middlewares/auth");
const roleGuard = require("../middlewares/roleGuard");

const router = Router();

// RF-017: registro y ajuste de stock por variante (MOD-03). Las tres rutas
// son de gestión interna (no catálogo público), por eso las tres requieren
// auth + roleGuard(["admin","vendedor"]) — mismo criterio que
// producto.routes.js para los endpoints de gestión de productos.
router.get(
  "/api/v1/inventario",
  auth,
  roleGuard(["admin", "vendedor"]),
  inventarioController.listar
);

router.post(
  "/api/v1/inventario/ajustes",
  auth,
  roleGuard(["admin", "vendedor"]),
  inventarioController.registrarAjuste
);

router.get(
  "/api/v1/inventario/:varianteId/historial",
  auth,
  roleGuard(["admin", "vendedor"]),
  inventarioController.historialPorVariante
);

module.exports = router;
