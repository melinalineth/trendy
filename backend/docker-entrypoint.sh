#!/bin/sh
# Entrypoint del contenedor del backend (staging):
#   1. espera a que la base responda,
#   2. aplica las migraciones (prisma migrate deploy),
#   3. opcionalmente carga el seed (RUN_SEED=true; es idempotente),
#   4. reemplaza el proceso por el comando final (node server.js).
# Si algo falla, el contenedor sale con código distinto de 0 y el mensaje queda
# en `docker compose logs backend`.
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] ERROR: falta DATABASE_URL" >&2
  exit 1
fi

echo "[entrypoint] esperando a la base de datos..."
node -e '
const mysql = require("mysql2/promise");
const intentos = 30;
(async () => {
  for (let i = 1; i <= intentos; i++) {
    try {
      const conexion = await mysql.createConnection(process.env.DATABASE_URL);
      await conexion.query("SELECT 1");
      await conexion.end();
      console.log("[entrypoint] la base responde (intento " + i + ")");
      return;
    } catch (error) {
      console.log("[entrypoint] la base todavia no responde (" + i + "/" + intentos + "): " + error.code);
      await new Promise((resolver) => setTimeout(resolver, 2000));
    }
  }
  console.error("[entrypoint] ERROR: la base no respondio a tiempo");
  process.exit(1);
})();
'

echo "[entrypoint] aplicando migraciones..."
./node_modules/.bin/prisma migrate deploy --config prisma7.config.ts

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] cargando el seed (RUN_SEED=true)..."
  node prisma/seed.js
fi

echo "[entrypoint] iniciando: $*"
exec "$@"
