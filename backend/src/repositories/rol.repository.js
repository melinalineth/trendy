const prisma = require("../config/prisma");

// Nombre del rol asignado por defecto a los registros de RF-001. Asume que
// existe un seed con este Rol — pendiente en Sprint 0/1 (ver reporte de la
// ronda). El registro no se bloquea por esto: si el rol no existe, Prisma
// rechaza el create del Usuario por la FK de rolId, que es el comportamiento
// correcto (no crear usuarios sin rol válido).
const ROL_CLIENTE = "cliente";

// RF-007: nombre de rol usado por vendedor.service para validar que el
// usuario objetivo de un cambio de estado sea efectivamente un vendedor.
const ROL_VENDEDOR = "vendedor";

async function buscarPorNombre(nombre) {
  return prisma.rol.findUnique({ where: { nombre } });
}

// RF-046: listado de roles con sus permisos asociados. No hay seed de
// Permiso todavía (la relación N-N Rol-Permiso es una decisión de Sprint 0
// sin confirmar por el equipo, ver comentario en schema.prisma) — es
// comportamiento correcto que cada rol devuelva `permisos: []`.
async function listarConPermisos() {
  return prisma.rol.findMany({
    include: { permisos: true },
    orderBy: { id: "asc" },
  });
}

// RF-046: reemplaza el conjunto COMPLETO de permisos del rol (no hace merge
// incremental) — `set` desconecta los permisos que ya no estén en
// `permisosIds` y conecta los nuevos, en una sola operación atómica.
async function actualizarPermisos(rolId, permisosIds) {
  return prisma.rol.update({
    where: { id: rolId },
    data: { permisos: { set: permisosIds.map((id) => ({ id })) } },
    include: { permisos: true },
  });
}

module.exports = {
  ROL_CLIENTE,
  ROL_VENDEDOR,
  buscarPorNombre,
  listarConPermisos,
  actualizarPermisos,
};
