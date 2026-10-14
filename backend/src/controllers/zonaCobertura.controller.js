const zonaService = require("../services/zonaCobertura.service");
const { validarZonaId } = require("../dtos/zonaCobertura.dto");

// RF-026 (DDS §3 MOD-05), solo admin (el roleGuard está en las rutas). Los
// errores de validación (400), zona inexistente (404) y zona duplicada (409)
// se propagan con throw a errorHandler.js (DDS §5.3). El body lo valida el
// service con el DTO; acá solo se valida el param :id.

// GET /api/v1/zonas-cobertura
const listar = async (req, res) => {
  const zonas = await zonaService.listar();

  return res.status(200).json(zonas);
};

// POST /api/v1/zonas-cobertura
const crear = async (req, res) => {
  const zona = await zonaService.crear(req.body);

  return res.status(201).json(zona);
};

// PUT /api/v1/zonas-cobertura/:id/tarifa
const cambiarTarifa = async (req, res) => {
  const zonaId = validarZonaId(req.params.id);
  const zona = await zonaService.cambiarTarifa(zonaId, req.body);

  return res.status(200).json(zona);
};

// PATCH /api/v1/zonas-cobertura/:id/estado
const cambiarEstado = async (req, res) => {
  const zonaId = validarZonaId(req.params.id);
  const zona = await zonaService.cambiarEstado(zonaId, req.body);

  return res.status(200).json(zona);
};

module.exports = {
  listar,
  crear,
  cambiarTarifa,
  cambiarEstado,
};
