const { Router } = require("express");
const vendedorController = require("../controllers/vendedor.controller");
const auth = require("../middlewares/auth");
const roleGuard = require("../middlewares/roleGuard");

const router = Router();

// RF-007: solo un administrador administra vendedores (activar/desactivar).
router.put(
  "/api/v1/vendedores/:id/estado",
  auth,
  roleGuard(["admin"]),
  vendedorController.cambiarEstado
);

module.exports = router;
