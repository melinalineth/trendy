const prisma = require("../config/prisma");

// RN-003: un cliente NO puede acceder a direcciones de otros clientes.
// TODA consulta de acá filtra SIEMPRE por usuarioId (nunca se busca una
// Direccion solo por su id) — así es estructuralmente imposible devolver
// direcciones ajenas, sin depender de que el controller/service lo valide
// "a mano" cada vez que se agregue un endpoint nuevo (ej: editar/borrar).

async function listarPorUsuario(usuarioId) {
  return prisma.direccion.findMany({
    where: { usuarioId },
    orderBy: { id: "asc" },
  });
}

// `client` es opcional para poder participar de un prisma.$transaction
// (el service lo usa al desmarcar la dirección principal anterior). Fuera
// de una transacción, usa el cliente centralizado de config/prisma.js.
async function crear(usuarioId, datos, client = prisma) {
  return client.direccion.create({
    data: { ...datos, usuarioId },
  });
}

// Desmarca todas las direcciones "esPrincipal" del usuario. Sigue el mismo
// contrato RN-003: el where siempre incluye usuarioId, nunca opera sobre
// todas las direcciones de la tabla.
async function desmarcarPrincipales(usuarioId, client = prisma) {
  return client.direccion.updateMany({
    where: { usuarioId, esPrincipal: true },
    data: { esPrincipal: false },
  });
}

module.exports = {
  listarPorUsuario,
  crear,
  desmarcarPrincipales,
};
