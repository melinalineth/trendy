const carritoService = require("../services/carrito.service");

const obtenerCarrito = async (req, res) => {
  try {
    const usuarioId = req.user.id;

    const carrito = await carritoService.obtenerCarrito(usuarioId);

    return res.status(200).json(carrito);
  } catch (error) {
    return res.status(500).json({
      mensaje: "Error al obtener el carrito",
      error: error.message,
    });
  }
};

const agregarItem = async (req, res) => {
  try {
    const usuarioId = req.user.id;
    const { varianteId, cantidad } = req.body;

    const item = await carritoService.agregarItem(
      usuarioId,
      varianteId,
      cantidad
    );

    return res.status(201).json(item);
  } catch (error) {
    if (error instanceof carritoService.StockInsuficienteError) {
      return res.status(409).json({
        mensaje: error.message,
      });
    }

    return res.status(500).json({
      mensaje: "Error al agregar el producto al carrito",
      error: error.message,
    });
  }
};

module.exports = {
  obtenerCarrito,
  agregarItem,
};