const prisma = require("../config/prisma");
const direccionRepository = require("../repositories/direccion.repository");

async function listar(usuarioId) {
  return direccionRepository.listarPorUsuario(usuarioId);
}

async function crear(usuarioId, datos) {
  if (!datos.esPrincipal) {
    return direccionRepository.crear(usuarioId, datos);
  }

  // Si la nueva dirección se marca como principal, desmarcar las demás del
  // mismo usuario y crear la nueva dentro de la MISMA transacción: evita
  // que, ante una falla a mitad de camino, queden dos direcciones (o
  // ninguna) marcadas como principal para ese usuario.
  return prisma.$transaction(async (tx) => {
    await direccionRepository.desmarcarPrincipales(usuarioId, tx);
    return direccionRepository.crear(usuarioId, datos, tx);
  });
}

module.exports = {
  listar,
  crear,
};
