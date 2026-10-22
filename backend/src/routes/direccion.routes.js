const { Router } = require("express");
const direccionController = require("../controllers/direccion.controller");
const auth = require("../middlewares/auth");

const router = Router();

// RF-005: cualquier usuario autenticado puede gestionar SUS PROPIAS
// direcciones, sin importar el rol — por eso solo se monta auth (exige
// estar logueado) y no roleGuard (que restringe por rol).
router.get("/api/v1/direcciones", auth, direccionController.listar);
router.post("/api/v1/direcciones", auth, direccionController.crear);
// Modificar y eliminar: el controller exige que la dirección sea del usuario
// del token (ajena o inexistente -> 404 igual, RN-003).
router.put("/api/v1/direcciones/:id", auth, direccionController.actualizar);
// PATCH: solo { esPrincipal } (marcar o desmarcar como principal).
router.patch("/api/v1/direcciones/:id", auth, direccionController.marcarPrincipal);
router.delete("/api/v1/direcciones/:id", auth, direccionController.eliminar);

module.exports = router;
