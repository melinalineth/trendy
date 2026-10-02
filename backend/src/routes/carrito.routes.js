const express = require("express");
const router = express.Router();

const carritoController = require("../controllers/carrito.controller");
const auth = require("../middlewares/auth");

// Obtener carrito del usuario autenticado
router.get("/", auth, carritoController.obtenerCarrito);

// Agregar producto al carrito
router.post("/items", auth, carritoController.agregarItem);

module.exports = router;