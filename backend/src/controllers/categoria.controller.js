const categoriaService = require("../services/categoria.service");

// RF-008: endpoint público, no requiere sesión — el catálogo se puede
// navegar sin estar logueado.
async function listar(req, res) {
  try {
    const categorias = await categoriaService.listar();
    return res.status(200).json(categorias);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al listar las categorías" });
  }
}

module.exports = {
  listar,
};
