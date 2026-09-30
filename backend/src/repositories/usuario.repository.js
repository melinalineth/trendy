const prisma = require("../config/prisma");

async function crear({ nombre, correo, passwordHash, rolId }) {
  return prisma.usuario.create({
    data: { nombre, correo, passwordHash, rolId },
  });
}

async function buscarPorCorreo(correo) {
  return prisma.usuario.findUnique({
    where: { correo },
    include: { rol: true },
  });
}

async function buscarPorId(id) {
  return prisma.usuario.findUnique({
    where: { id },
    include: { rol: true },
  });
}

async function actualizarPassword(id, passwordHash) {
  return prisma.usuario.update({
    where: { id },
    data: { passwordHash },
  });
}

// RF-007/RF-045: función genérica de cambio de estado, reusada tanto por
// vendedor.service (activar/desactivar vendedores) como por usuario.service
// (activar/desactivar cualquier usuario) — evita duplicar la misma query de
// update en dos repositories distintos.
async function actualizarEstado(id, estado) {
  return prisma.usuario.update({
    where: { id },
    data: { estado },
  });
}

// RF-045: listado completo para la gestión admin de usuarios. Incluye `rol`
// porque el admin necesita "consultar el rol asignado" (criterio del RF).
async function listarTodos() {
  return prisma.usuario.findMany({
    include: { rol: true },
    orderBy: { id: "asc" },
  });
}

module.exports = {
  crear,
  buscarPorCorreo,
  buscarPorId,
  actualizarPassword,
  actualizarEstado,
  listarTodos,
};
