const prisma = require("../config/prisma");

// RF-008: solo categorías activas alimentan el filtro público de catálogo.
// ERS §2.8.3: no hay gestión dinámica de categorías en el MVP (eso es
// v2.0) — la lista sale de la semilla de prisma/seed.js, esta función solo
// lee lo que ya está cargado en la base.
async function listarActivas() {
  return prisma.categoria.findMany({
    where: { estado: "ACTIVO" },
    orderBy: { id: "asc" },
  });
}

module.exports = {
  listarActivas,
};
