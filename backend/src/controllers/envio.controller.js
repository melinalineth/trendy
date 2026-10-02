const envioService = require("../services/envio.service");

const obtenerTarifa = async (req, res) => {
  try {
    const usuarioId = req.user.id;
    const direccionId = Number(req.query.direccionId);

    const tarifa = await envioService.obtenerTarifa(
      usuarioId,
      direccionId
    );

    return res.status(200).json(tarifa);
  } catch (error) {
    if (error instanceof envioService.SinCoberturaError) {
      return res.status(409).json({
        mensaje: error.message,
      });
    }

    return res.status(500).json({
      mensaje: "Error al calcular la tarifa de envío",
      error: error.message,
    });
  }
};

module.exports = {
  obtenerTarifa,
};