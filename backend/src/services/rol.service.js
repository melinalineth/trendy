const rolRepository = require("../repositories/rol.repository");

class RolNoEncontradoError extends Error {}

// RF-046: los permisos están asociados a funciones específicas del sistema.
// No hay seed de Permiso todavía, así que roles sin permisos asignados
// devuelven `permisos: []` — es comportamiento correcto, no un error.
async function listar() {
  return rolRepository.listarConPermisos();
}

// RF-046: solo el admin modifica permisos administrativos (impuesto por
// roleGuard en la ruta). Los cambios aplican recién en la siguiente
// validación de autorización de cada usuario con ese rol — no hay que
// "empujar" el cambio a sesiones activas (comportamiento ya documentado
// desde la Ronda 1/roleGuard).
async function actualizarPermisos(rolId, permisosIds) {
  try {
    return await rolRepository.actualizarPermisos(rolId, permisosIds);
  } catch (error) {
    // P2025: Prisma no encuentra el Rol, o alguno de los ids de
    // `permisosIds` no corresponde a un Permiso existente al resolver la
    // relación `set` — en ambos casos se traduce a un 404 de dominio.
    if (error.code === "P2025") {
      throw new RolNoEncontradoError("El rol o alguno de los permisos indicados no existe");
    }

    throw error;
  }
}

module.exports = {
  listar,
  actualizarPermisos,
  RolNoEncontradoError,
};
