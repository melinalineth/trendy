const direccionService = require("../services/direccion.service");
const { crearDireccionSchema } = require("../dtos/direccion.dto");

function formatearErroresZod(error) {
  return error.issues.map((issue) => issue.message).join(", ");
}

// Controller delgado: valida DTO y delega en el service. Errores no
// esperados (ej: falla de DB) se propagan via throw/reject — Express 5
// reenvía automáticamente las rejections de un handler async al middleware
// de errores (errorHandler.js), no hace falta un try/catch genérico acá.

async function listar(req, res) {
  // RN-003: req.usuario.id viene del JWT ya verificado por el middleware
  // auth.js, NUNCA de body/params/query del request — así un cliente no
  // puede pedir las direcciones de otro usuario manipulando la request.
  const direcciones = await direccionService.listar(req.usuario.id);
  return res.status(200).json(direcciones);
}

async function crear(req, res) {
  const parseo = crearDireccionSchema.safeParse(req.body ?? {});
  if (!parseo.success) {
    return res.status(400).json({ error: formatearErroresZod(parseo.error) });
  }

  const direccion = await direccionService.crear(req.usuario.id, parseo.data);
  return res.status(201).json(direccion);
}

module.exports = {
  listar,
  crear,
};
