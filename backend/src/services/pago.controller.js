
const pagoService = require("../services/pago.service");
const {
  validarPreferenciaMercadoPago,
} = require("../dtos/pago.dto");

async function crearPreferencia(req, res) {
  try {
    const { pedidoId } = validarPreferenciaMercadoPago(req.body);
    const usuarioId = req.usuario.id;

    const resultado = await pagoService.crearPreferencia(
      pedidoId,
      usuarioId
    );

    return res.status(200).json({
      mensaje: "Preferencia de pago creada correctamente",
      datos: resultado,
    });
  } catch (error) {
    if (error.errores) {
      return res.status(400).json({
        mensaje: error.message,
        errores: error.errores,
      });
    }

    if (error instanceof pagoService.PedidoNoEncontradoError) {
      return res.status(404).json({ mensaje: error.message });
    }

    if (error instanceof pagoService.PagoInvalidoError) {
      return res.status(400).json({ mensaje: error.message });
    }

    console.error("Error al crear preferencia:", error.message);

    return res.status(error.status || 500).json({
      mensaje:
        error.status && error.status < 500
          ? error.message
          : "Error interno al crear la preferencia de pago",
    });
  }
}

async function recibirWebhook(req, res) {
  try {
    const payload = req.body;

    // El webhook debe contener una notificación de pago válida.
    const dataId = payload?.data?.id;
    const tipo = payload?.type;

    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      typeof tipo !== "string" ||
      (tipo === "payment" &&
        (dataId === undefined ||
          dataId === null ||
          String(dataId).trim() === ""))
    ) {
      return res.status(400).json({
        mensaje: "Payload de webhook malformado",
      });
    }

    const firma = {
      xSignature: req.get("x-signature"),
      xRequestId: req.get("x-request-id"),
      dataId: String(dataId ?? ""),
    };

    await pagoService.procesarWebhook(payload, firma);

    // Incluye notificaciones repetidas o tipos válidos que no se procesan.
    return res.status(200).json({ recibido: true });
  } catch (error) {
    if (error instanceof pagoService.PagoInvalidoError) {
      return res.status(401).json({
        mensaje: "Webhook inválido o firma no válida",
      });
    }

    // Un error interno no debe ocultarse como si la notificación
    // se hubiera procesado correctamente.
    console.error("Error al procesar webhook:", error.message);

    return res.status(500).json({
      mensaje: "No fue posible procesar la notificación",
    });
  }
}

module.exports = {
  crearPreferencia,
  recibirWebhook,
};
