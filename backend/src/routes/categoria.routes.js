const { Router } = require("express");
const categoriaController = require("../controllers/categoria.controller");

const router = Router();

// RF-008: catálogo público, sin auth ni roleGuard — cualquier visitante
// puede listar las categorías activas para filtrar productos.
router.get("/api/v1/categorias", categoriaController.listar);

module.exports = router;
