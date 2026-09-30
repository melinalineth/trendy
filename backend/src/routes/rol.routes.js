const { Router } = require("express");
const rolController = require("../controllers/rol.controller");
const auth = require("../middlewares/auth");
const roleGuard = require("../middlewares/roleGuard");

const router = Router();

// RF-046: solo el admin consulta/modifica roles y sus permisos.
router.get("/api/v1/roles", auth, roleGuard(["admin"]), rolController.listar);
router.put(
  "/api/v1/roles/:id/permisos",
  auth,
  roleGuard(["admin"]),
  rolController.actualizarPermisos
);

module.exports = router;
