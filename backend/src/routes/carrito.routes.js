const express = require("express");
const router = express.Router();

const carritoController = require("../controllers/carrito.controller");
const auth = require("../middlewares/auth");
const roleGuard = require("../middlewares/roleGuard");

// DDS §3 MOD-04 / ERS 4.1: "Administrar carrito" es del cliente autenticado
// (vendedor y administrador no tienen carrito), por eso auth + roleGuard.
// Convención del proyecto: cada route file declara el path COMPLETO bajo
// /api/v1 y app.js lo monta sin prefijo.

// Obtener carrito del usuario autenticado
router.get(
  "/api/v1/carrito",
  auth,
  roleGuard(["cliente"]),
  carritoController.obtenerCarrito
);

// Agregar producto al carrito
router.post(
  "/api/v1/carrito/items",
  auth,
  roleGuard(["cliente"]),
  carritoController.agregarItem
);

// Modificar cantidad de un item
router.put(
  "/api/v1/carrito/items/:id",
  auth,
  roleGuard(["cliente"]),
  carritoController.modificarItem
);

// Eliminar un item
router.delete(
  "/api/v1/carrito/items/:id",
  auth,
  roleGuard(["cliente"]),
  carritoController.eliminarItem
);

// Obtener resumen del carrito con costo de envío
router.get(
  "/api/v1/carrito/resumen",
  auth,
  roleGuard(["cliente"]),
  carritoController.resumen
);

module.exports = router;
