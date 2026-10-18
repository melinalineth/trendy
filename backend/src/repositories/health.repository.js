const prisma = require("../config/prisma");

// Healthcheck: confirma que la base contesta con la consulta más barata
// posible, por el cliente Prisma único (config/prisma.js). Devuelve true o
// lanza el error de la base; no lee ninguna tabla ni devuelve datos.
async function ping() {
  await prisma.$queryRaw`SELECT 1`;
  return true;
}

module.exports = { ping };
