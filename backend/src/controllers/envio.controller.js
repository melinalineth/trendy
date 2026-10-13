const envioService = require("../services/envio.service");
const { validarDireccionId } = require("../dtos/envio.dto");

// GET /api/v1/envios/tarifa?direccionId= (DDS §3 MOD-05). Los errores de
// cobertura (409), dirección inexistente/ajena (404) y validación (400) se
// propagan con throw a errorHandler.js (DDS §5.3).
//
// RN-003: el usuarioId sale de req.usuario (JWT); envioService.calcularCosto
// busca la dirección filtrando por ese usuario, así que una ajena llega como
// "no existe".
const obtenerTarifa = async (req, res) => {
  const direccionId = validarDireccionId(req.query.direccionId);

  const tarifa = await envioService.calcularCosto(direccionId, req.usuario.id);

  return res.status(200).json(tarifa);
};

module.exports = {
  obtenerTarifa,
};
