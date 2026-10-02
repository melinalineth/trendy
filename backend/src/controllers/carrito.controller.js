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

const modificarItem = async (req, res) => {
  try {
    const usuarioId = req.user.id;
    const itemId = Number(req.params.id);
    const { cantidad } = req.body;

    const item = await carritoService.modificarItem(
      usuarioId,
      itemId,
      cantidad
    );

    return res.status(200).json(item);
  } catch (error) {
    if (error instanceof carritoService.StockInsuficienteError) {
      return res.status(409).json({
        mensaje: error.message,
      });
    }

    return res.status(500).json({
      mensaje: "Error al modificar el item del carrito",
      error: error.message,
    });
  }
};

const eliminarItem = async (req, res) => {
  try {
    const usuarioId = req.user.id;
    const itemId = Number(req.params.id);

    const resultado = await carritoService.eliminarItem(
      usuarioId,
      itemId
    );

    return res.status(200).json(resultado);
  } catch (error) {
    return res.status(500).json({
      mensaje: "Error al eliminar el item del carrito",
      error: error.message,
    });
  }
};

const resumen = async (req, res) => {
  try {
    const usuarioId = req.user.id;
    const direccionId = Number(req.query.direccionId);

    const resultado = await carritoService.resumen(
      usuarioId,
      direccionId
    );

    return res.status(200).json(resultado);
  } catch (error) {
    if (error instanceof carritoService.SinCoberturaError) {
      return res.status(409).json({
        mensaje: error.message,
      });
    }

    return res.status(500).json({
      mensaje: "Error al obtener el resumen del carrito",
      error: error.message,
    });
  }
};

module.exports = {
  obtenerCarrito,
  agregarItem,
  modificarItem,
  eliminarItem,
  resumen,
};

