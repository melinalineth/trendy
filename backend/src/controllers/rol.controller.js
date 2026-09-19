const rolService = require("../services/rol.service");
const { actualizarPermisosSchema } = require("../dtos/rol.dto");

function formatearErroresZod(error) {
  return error.issues.map((issue) => issue.message).join(", ");
}

async function listar(req, res) {
  const roles = await rolService.listar();
  return res.status(200).json(roles);
}

async function actualizarPermisos(req, res) {
  const rolId = Number(req.params.id);
  if (!Number.isInteger(rolId)) {
    return res.status(400).json({ error: "El id del rol es inválido" });
  }

  const parseo = actualizarPermisosSchema.safeParse(req.body ?? {});
  if (!parseo.success) {
    return res.status(400).json({ error: formatearErroresZod(parseo.error) });
  }

  try {
    const rol = await rolService.actualizarPermisos(rolId, parseo.data.permisosIds);
    return res.status(200).json(rol);
  } catch (error) {
    if (error instanceof rolService.RolNoEncontradoError) {
      return res.status(404).json({ error: error.message });
    }

    console.error(error);
    return res.status(500).json({ error: "Error al actualizar los permisos del rol" });
  }
}

module.exports = {
  listar,
  actualizarPermisos,
};
