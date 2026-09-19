const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

// Prisma 7 requiere un driver adapter explícito: ya no arma la conexión
// automáticamente a partir de datasource.url en schema.prisma (ver
// https://pris.ly/d/prisma7-client-config). Usamos @prisma/adapter-mariadb
// porque no existe un @prisma/adapter-mysql dedicado; el driver "mariadb"
// es wire-compatible con MySQL y es el adapter oficial de Prisma para
// datasource provider = "mysql".
//
// Sprint 1: se centraliza acá la ÚNICA instancia de PrismaClient del
// backend. Todos los repositories importan este módulo en vez de crear su
// propio PrismaClient/adapter (patrón repetido en Sprint 0 dentro de
// usuario.repository.js).
const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
