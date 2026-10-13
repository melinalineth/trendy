
const pagoService = require("../services/pago.service");

// Registrar pago contra entrega
const registrarContraEntrega = async (req, res) => {
  try {
    const { pedidoId } = req.body;
    const usuarioId = req.user.id;

    const pago = await pagoService.registrarContraEntrega({
      pedidoId,
      usuarioId,
    });

    return res.status(201).json(pago);
  } catch (error) {
    return res.status(500).json({
      mensaje: "Error al registrar el pago contra entrega",
      error: error.message,
    });
  }
};

// Consultar pago de un pedido
const obtenerPagoPorPedido = async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const usuarioId = req.user.id;
    const rol = req.user.rol;

    const pago = await pagoService.obtenerPagoPorPedido({
      pedidoId,
      usuarioId,
      rol,
    });

    return res.status(200).json(pago);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        mensaje: error.message,
      });
    }

    if (error.statusCode === 403) {
      return res.status(403).json({
        mensaje: error.message,
      });
    }

    return res.status(500).json({
      mensaje: "Error al consultar el pago",
      error: error.message,
    });
  }
};

// Confirmar recepción del pago (admin/vendedor)
const confirmarRecepcion = async (req, res) => {
  try {
    const pedidoId = Number(req.params.pedidoId);
    const usuarioId = req.user.id;

    const pago = await pagoService.confirmarRecepcion({
      pedidoId,
      usuarioId,
    });

    return res.status(200).json({
      mensaje: "Recepción del pago confirmada correctamente",
      pago,
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        mensaje: error.message,
      });
    }

    return res.status(500).json({
      mensaje: "Error al confirmar la recepción del pago",
      error: error.message,
    });
  }
};

module.exports = {
  registrarContraEntrega,
  obtenerPagoPorPedido,
  confirmarRecepcion,
};
