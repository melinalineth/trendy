const direccionService = require("../services/direccion.service");
const {
  actualizarDireccionSchema,
  principalDireccionSchema,
  validarCuerpoDireccion,
  validarIdDireccion,
} = require("../dtos/direccion.dto");

// Controller delgado: valida DTO y delega en el service. Los errores (de
// validación, de dominio o inesperados como una falla de DB) se propagan via
// throw/reject — Express 5 reenvía automáticamente las rejections de un
// handler async a errorHandler.js, que responde la forma estándar
// { error: { codigo, mensaje, detalles } } (DDS §5.3).

async function listar(req, res) {
  // RN-003: req.usuario.id viene del JWT ya verificado por el middleware
  // auth.js, NUNCA de body/params/query del request — así un cliente no
  // puede pedir las direcciones de otro usuario manipulando la request.
  const direcciones = await direccionService.listar(req.usuario.id);
  return res.status(200).json(direcciones);
}

async function crear(req, res) {
  const datos = validarCuerpoDireccion(req.body);

  const direccion = await direccionService.crear(req.usuario.id, datos);
  return res.status(201).json(direccion);
}

// PUT /api/v1/direcciones/:id. Devuelve la dirección vigente: ojo, si la
// original tenía pedidos su `id` puede ser OTRO (ver direccion.service.js).
async function actualizar(req, res) {
  const id = validarIdDireccion(req.params.id);
  const datos = validarCuerpoDireccion(req.body, actualizarDireccionSchema);

  const direccion = await direccionService.actualizar(req.usuario.id, id, datos);
  return res.status(200).json(direccion);
}

// PATCH /api/v1/direcciones/:id con { esPrincipal }: solo el flag, sin tocar
// los datos de entrega.
async function marcarPrincipal(req, res) {
  const id = validarIdDireccion(req.params.id);
  const { esPrincipal } = validarCuerpoDireccion(req.body, principalDireccionSchema);

  const direccion = await direccionService.marcarPrincipal(req.usuario.id, id, esPrincipal);
  return res.status(200).json(direccion);
}

// DELETE /api/v1/direcciones/:id -> 204 sin cuerpo.
async function eliminar(req, res) {
  const id = validarIdDireccion(req.params.id);

  await direccionService.eliminar(req.usuario.id, id);
  return res.status(204).end();
}

module.exports = {
  listar,
  crear,
  actualizar,
  marcarPrincipal,
  eliminar,
};
