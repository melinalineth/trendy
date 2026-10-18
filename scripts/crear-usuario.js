#!/usr/bin/env node
// Crea un usuario con rol admin, vendedor o cliente.
//
// Por qué existe: la aplicación no tiene ninguna pantalla ni endpoint para crear
// vendedores o administradores (el registro siempre da rol «cliente» y el seed solo
// crea un admin si le pasás SEED_ADMIN_CORREO y SEED_ADMIN_PASSWORD). Este script
// cubre ese hueco para armar entornos de desarrollo, demo o staging.
//
// Uso (desde la raíz del repositorio):
//
//   NUEVO_USUARIO_PASSWORD='<elegí una clave>' \
//   node scripts/crear-usuario.js --correo demo-vendedor@trendy.test \
//        --nombre "Vendedor Demo" --rol vendedor
//
// - La contraseña SOLO se lee de la variable NUEVO_USUARIO_PASSWORD: nunca por
//   argumento (quedaría en el historial del shell) y sin valor por defecto.
// - Mínimo 8 caracteres y no puede empezar por «changeme».
// - Es idempotente: si el correo ya existe NO se modifica nada (ni la contraseña ni el
//   rol) y se informa el rol que ya tiene.
// - Usa la base de backend/.env (DATABASE_URL). Una DATABASE_URL ya exportada en el
//   shell tiene prioridad sobre el archivo. Los roles tienen que existir: corré antes
//   el seed (npx prisma db seed --config prisma7.config.ts).
// - Nunca imprime la contraseña, su hash ni la URL de la base.
//
// Código de salida: 0 si creó el usuario o si ya existía; 1 si hubo algún error.

"use strict";

const path = require("node:path");
const { createRequire } = require("node:module");
const { parseArgs } = require("node:util");

const BACKEND = path.join(__dirname, "..", "backend");
// Resuelve dotenv, zod, bcrypt y el cliente de Prisma desde backend/node_modules.
const requireBackend = createRequire(path.join(BACKEND, "package.json"));

const ROLES_VALIDOS = ["admin", "vendedor", "cliente"];
const LARGO_MINIMO_PASSWORD = 8;
const PREFIJO_PROHIBIDO = "changeme";

const AYUDA = `Uso:
  NUEVO_USUARIO_PASSWORD='<clave>' node scripts/crear-usuario.js \\
    --correo <correo> --nombre "<nombre>" --rol <admin|vendedor|cliente>

La contraseña se lee solo de la variable de entorno NUEVO_USUARIO_PASSWORD
(mínimo ${LARGO_MINIMO_PASSWORD} caracteres, sin empezar por «${PREFIJO_PROHIBIDO}»).
Si el correo ya existe no se modifica nada y se informa su rol.`;

function fallar(mensaje) {
  console.error(`Error: ${mensaje}`);
  process.exitCode = 1;
}

// Quita del texto de un error cualquier valor secreto antes de mostrarlo.
function sinSecretos(texto, secretos) {
  return secretos
    .filter((secreto) => typeof secreto === "string" && secreto.length > 0)
    .reduce((acumulado, secreto) => acumulado.split(secreto).join("***"), texto);
}

function leerArgumentos() {
  try {
    return parseArgs({
      options: {
        correo: { type: "string" },
        nombre: { type: "string" },
        rol: { type: "string" },
        ayuda: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    throw new Error(`${error.message}\n\n${AYUDA}`);
  }
}

function validar({ correo, nombre, rol }, password) {
  const { loginSchema } = requireBackend("./src/dtos/auth.dto");

  if (!correo || !correo.trim()) throw new Error("Falta --correo.");
  if (!nombre || !nombre.trim()) throw new Error("Falta --nombre.");
  if (!rol) throw new Error("Falta --rol (admin, vendedor o cliente).");

  const correoLimpio = correo.trim();

  // Mismo criterio de correo que el login y el seed (zod .email()).
  if (!loginSchema.shape.correo.safeParse(correoLimpio).success) {
    throw new Error("El correo no tiene formato de correo válido.");
  }

  if (!ROLES_VALIDOS.includes(rol)) {
    throw new Error(`El rol «${rol}» no es válido. Usá: ${ROLES_VALIDOS.join(", ")}.`);
  }

  if (password === undefined || password === "") {
    throw new Error(
      "Falta la contraseña: definí la variable de entorno NUEVO_USUARIO_PASSWORD (no se acepta por argumento).",
    );
  }

  if (password.length < LARGO_MINIMO_PASSWORD) {
    throw new Error(
      `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`,
    );
  }

  if (password.toLowerCase().startsWith(PREFIJO_PROHIBIDO)) {
    throw new Error(
      `La contraseña no puede empezar por «${PREFIJO_PROHIBIDO}»: es el valor de ejemplo de las plantillas.`,
    );
  }

  return { correo: correoLimpio, nombre: nombre.trim(), rol };
}

async function main() {
  const argumentos = leerArgumentos();

  if (argumentos.ayuda) {
    console.log(AYUDA);
    return;
  }

  const password = process.env.NUEVO_USUARIO_PASSWORD;
  const datos = validar(argumentos, password);

  // Carga backend/.env en este proceso. No pisa variables ya definidas en el shell.
  requireBackend("dotenv").config({ path: path.join(BACKEND, ".env"), quiet: true });

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL no está definida: completá backend/.env (o exportala en el shell).",
    );
  }

  const prisma = requireBackend("./src/config/prisma");
  const { hashPassword } = requireBackend("./src/utils/hash");

  try {
    const existente = await prisma.usuario.findUnique({
      where: { correo: datos.correo },
      include: { rol: true },
    });

    if (existente) {
      console.log(
        `El usuario ${datos.correo} ya existe con rol ${existente.rol.nombre}; no se modificó nada.`,
      );
      return;
    }

    const rol = await prisma.rol.findUnique({ where: { nombre: datos.rol } });

    if (!rol) {
      throw new Error(
        `El rol «${datos.rol}» no existe en la base. Corré antes el seed: npx prisma db seed --config prisma7.config.ts (desde backend/).`,
      );
    }

    try {
      await prisma.usuario.create({
        data: {
          nombre: datos.nombre,
          correo: datos.correo,
          passwordHash: await hashPassword(password),
          rolId: rol.id,
        },
      });
    } catch (error) {
      // Carrera con otra creación del mismo correo (restricción de unicidad).
      if (error?.code === "P2002") {
        const ahora = await prisma.usuario.findUnique({
          where: { correo: datos.correo },
          include: { rol: true },
        });
        console.log(
          `El usuario ${datos.correo} ya existe con rol ${ahora?.rol?.nombre ?? "desconocido"}; no se modificó nada.`,
        );
        return;
      }
      throw error;
    }

    console.log(`Usuario creado: ${datos.correo} (rol ${datos.rol}).`);
  } finally {
    await prisma.$disconnect();
  }
}

// Los errores de Prisma traen un recuadro de código antes de la causa real: se
// descartan esas líneas y se conserva el final, que es lo que explica qué pasó.
function resumirError(error) {
  const lineas = String(error?.message ?? error)
    .split("\n")
    .filter(
      (linea) =>
        linea.trim() &&
        !/^\s*(→\s*)?\d+\s/.test(linea) &&
        !/invocation/i.test(linea) &&
        !linea.includes("crear-usuario.js"),
    );
  const resumen = lineas.slice(-4).join("\n");

  return /pool timeout|ECONNREFUSED|Can't reach/i.test(resumen)
    ? `${resumen}\nNo se pudo conectar a la base: ¿está MySQL levantado y es correcta DATABASE_URL?`
    : resumen;
}

main().catch((error) => {
  const secretos = [process.env.NUEVO_USUARIO_PASSWORD, process.env.DATABASE_URL];
  // Nunca se muestran la contraseña ni la URL de la base, aunque el error las repita.
  fallar(sinSecretos(resumirError(error), secretos));
});
