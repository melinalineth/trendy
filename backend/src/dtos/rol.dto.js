const { z } = require("zod");

// RF-046: reemplaza el conjunto completo de permisos del rol — el body es
// simplemente la lista de ids de Permiso que el rol debe tener después del
// update (ver rol.repository.actualizarPermisos, que hace `set`, no merge).
const actualizarPermisosSchema = z.object({
  permisosIds: z.array(
    z.number({ error: "Cada id de permiso debe ser numérico" }).int(),
    { error: "permisosIds es requerido y debe ser un array" }
  ),
});

module.exports = {
  actualizarPermisosSchema,
};
