
const pedidoService = require("../services/pedido.service");
const envioService = require("../services/envio.service");

async function obtenerSeguimiento(req, res) {
  try {
    const pedidoId = Number(req.params.id);
    const usuarioId = Number(req.usuario.id);

    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({
        mensaje: "El identificador del pedido no es válido",
      });
    }

    const seguimiento = await pedidoService.obtenerSeguimiento(
      pedidoId,
      usuarioId
    );

    if (!seguimiento) {
      return res.status(404).json({
        mensaje: "Pedido no encontrado",
      });
    }

    return res.status(200).json({
      mensaje: "Seguimiento del pedido obtenido correctamente",
      datos: seguimiento,
    });
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return res.status(error.status).json({
        mensaje: error.message,
      });
    }

    console.error("Error al obtener seguimiento:", error.message);

    return res.status(500).json({
      mensaje: "Error interno al consultar el seguimiento",
    });
  }
}

async function actualizarEstadoEnvio(req, res) {
  try {
    const pedidoId = Number(req.params.id);
    const { estadoEnvio } = req.body;

    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({
        mensaje: "El identificador del pedido no es válido",
      });
    }

    if (
      typeof estadoEnvio !== "string" ||
      estadoEnvio.trim() === ""
    ) {
      return res.status(400).json({
        mensaje: "El campo estadoEnvio es obligatorio",
      });
    }

    const resultado = await envioService.actualizarEstadoEnvio(
      pedidoId,
      estadoEnvio.trim(),
      req.usuario.id
    );

    return res.status(200).json({
      mensaje: "Estado del envío actualizado correctamente",
      datos: resultado,
    });
  } catch (error) {
    if (error.status && error.status < 500) {
      return res.status(error.status).json({
        mensaje: error.message,
      });
    }

    console.error("Error al actualizar estado de envío:", error.message);

    return res.status(500).json({
      mensaje: "Error interno al actualizar el estado del envío",
    });
  }
}
