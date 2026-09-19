const { Router } = require("express");
const usuarioController = require("../controllers/usuario.controller");
const auth = require("../middlewares/auth");
const roleGuard = require("../middlewares/roleGuard");

const router = Router();

// RF-045: consulta y activación/desactivación de cualquier usuario —
// exclusivo de admin.
router.get("/api/v1/usuarios", auth, roleGuard(["admin"]), usuarioController.listar);
router.patch(
  "/api/v1/usuarios/:id/estado",
  auth,
  roleGuard(["admin"]),
  usuarioController.cambiarEstado
);

module.exports = router;
