// Seed de roles base del sistema (DDS §3, matriz de roles y permisos de la
// ERS §4.1: administrador, vendedor, cliente). Sin esto, RF-001 (registro)
// falla por la FK de Usuario.rolId — ver comentario en
// src/repositories/rol.repository.js.
//
// Uso: npx prisma db seed (requiere DATABASE_URL apuntando a una base viva).

const prisma = require("../src/config/prisma");

const ROLES = ["cliente", "vendedor", "admin"];

async function main() {
  for (const nombre of ROLES) {
    const rol = await prisma.rol.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    });
    console.log(`Rol listo: ${rol.nombre} (id=${rol.id})`);
  }
}

main()
  .catch((error) => {
    console.error("Error al correr el seed de roles:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
