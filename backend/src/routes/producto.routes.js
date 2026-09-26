const { Router } = require("express");
const productoController = require("../controllers/producto.controller");
const imagenController = require("../controllers/imagen.controller");
const varianteController = require("../controllers/variante.controller");
const auth = require("../middlewares/auth");
const roleGuard = require("../middlewares/roleGuard");

const router = Router();

// RF-008 a RF-011: catálogo público, sin auth ni roleGuard.
// GET /api/v1/productos?categoria=&talla=&precioMin=&precioMax=&q=
router.get("/api/v1/productos", productoController.listar);

// RF-012: detalle de producto (MOD-02), público. No colisiona con la ruta
// de arriba: Express matchea por cantidad de segmentos, así que el orden
// entre estas dos no importa (no hay otro path fijo tipo /productos/algo
// que pudiera ser tapado por el :id).
router.get("/api/v1/productos/:id", productoController.getById);

// RF-013: gestión de productos por admin/vendedor. Límite conocido (DDS
// §6.2, ver nota en producto.service.js): roleGuard(["admin","vendedor"])
// deja pasar a CUALQUIER vendedor, no solo al dueño del producto — el
// modelo Producto no tiene vendedorId todavía, así que no hay forma de
// restringir por dueño en esta ronda.
router.post(
  "/api/v1/productos",
  auth,
  roleGuard(["admin", "vendedor"]),
  productoController.crear
);
router.put(
  "/api/v1/productos/:id",
  auth,
  roleGuard(["admin", "vendedor"]),
  productoController.actualizar
);
router.patch(
  "/api/v1/productos/:id/estado",
  auth,
  roleGuard(["admin", "vendedor"]),
  productoController.cambiarEstado
);

// RF-014: gestión de imágenes de producto por admin/vendedor. Ver
// decisión de diseño (sin upload real de archivo) en imagen.controller.js.
router.post(
  "/api/v1/productos/:id/imagenes",
  auth,
  roleGuard(["admin", "vendedor"]),
  imagenController.crear
);

// RF-016: alta de variantes (talla/color/SKU/stock) por admin/vendedor.
router.post(
  "/api/v1/productos/:id/variantes",
  auth,
  roleGuard(["admin", "vendedor"]),
  varianteController.crear
);

module.exports = router;
