#!/bin/sh
# Entrypoint del contenedor del backend (staging):
#   1. valida las variables (secretos de ejemplo, DATABASE_URL) y falla rápido,
#   2. espera a que la base responda,
#   3. aplica las migraciones (prisma migrate deploy),
#   4. opcionalmente carga el seed (RUN_SEED=true; es idempotente),
#   5. reemplaza el proceso por el comando final (node server.js).
# Si algo falla, el contenedor sale con código distinto de 0 y el mensaje queda
# en `docker compose logs backend`.
set -eu

node docker/validar-entorno.js

echo "[entrypoint] esperando a la base de datos..."
node docker/esperar-base.js

echo "[entrypoint] aplicando migraciones..."
./node_modules/.bin/prisma migrate deploy --config prisma7.config.ts

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] cargando el seed (RUN_SEED=true)..."
  node prisma/seed.js
fi

echo "[entrypoint] iniciando: $*"
exec "$@"
