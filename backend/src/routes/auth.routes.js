const { Router } = require("express");
const authController = require("../controllers/auth.controller");
const auth = require("../middlewares/auth");

const router = Router();

// DDS §5.1: todas las rutas se exponen bajo el prefijo /api/v1.
router.post("/api/v1/auth/register", authController.register);
router.post("/api/v1/auth/login", authController.login);
router.post("/api/v1/auth/logout", auth, authController.logout);
router.post("/api/v1/auth/recuperar-password", authController.recuperarPassword);
router.post("/api/v1/auth/restablecer-password", authController.restablecerPassword);

module.exports = router;
