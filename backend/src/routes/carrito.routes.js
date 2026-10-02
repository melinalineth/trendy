const express = require("express");
const router = express.Router();

const carritoController = require("../controllers/carrito.controller");
const auth = require("../middlewares/auth");

// Obtener carrito del usuario autenticado
router.get("/", auth, carritoController.obtenerCarrito);

// Agregar producto al carrito
router.post("/items", auth, carritoController.agregarItem);

// Modificar cantidad de un item
router.put(
  "/items/:id",
  auth,
  carritoController.modificarItem
);

// Eliminar un item
router.delete(
    "/items/:id",
    auth,
    carritoController.eliminarItem
);

// Obtener resumen del carrito con costo de envío
router.get(
    "/resumen",
    auth,
    carritoController.resumen
);


module.exports = router;