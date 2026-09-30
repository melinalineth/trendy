const { Router } = require("express");
const direccionController = require("../controllers/direccion.controller");
const auth = require("../middlewares/auth");

const router = Router();

// RF-005: cualquier usuario autenticado puede gestionar SUS PROPIAS
// direcciones, sin importar el rol — por eso solo se monta auth (exige
// estar logueado) y no roleGuard (que restringe por rol).
router.get("/api/v1/direcciones", auth, direccionController.listar);
router.post("/api/v1/direcciones", auth, direccionController.crear);

module.exports = router;
