# Imagen del backend de Trendy pensada para STAGING (Docker Compose).
#
# Decisiones:
#  - Se instalan TODAS las dependencias (también las de desarrollo): la CLI de
#    Prisma (`prisma`, devDependency) hace falta DENTRO del contenedor para
#    `prisma generate` y `prisma migrate deploy`. Costo: la imagen pesa más
#    (incluye nodemon y la CLI de Prisma con sus motores). La alternativa es
#    mover `prisma` a `dependencies` y usar `npm ci --omit=dev`, pero eso
#    cambia package.json/package-lock.json y es una decisión del equipo; para
#    producción conviene una imagen multi-etapa que deje solo el cliente.
#  - `prisma generate` corre en el build: el cliente queda dentro de la imagen
#    (sin él el servidor falla con "Prisma Client no inicializado").
#  - Las migraciones NO van en el build (necesitan la base) ni en el CMD: las
#    aplica docker-entrypoint.sh al arrancar, antes de levantar el servidor.
#  - Corre como el usuario no root `node` que trae la imagen base.
#  - El HEALTHCHECK se define en docker-compose.yml (contra /api/v1/health).
FROM node:20-alpine

# Directorio de trabajo propiedad del usuario no root, así `npm ci` y
# `prisma generate` escriben sin permisos de más.
RUN mkdir -p /app && chown node:node /app
WORKDIR /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node . .

# prisma7.config.ts lee DATABASE_URL, pero `generate` no se conecta a la base:
# se pasa una URL ficticia solo para este paso (no queda en la imagen).
RUN DATABASE_URL="mysql://build:build@localhost:3306/build" \
    ./node_modules/.bin/prisma generate --config prisma7.config.ts

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

# Se invoca con `sh` para no depender del bit de ejecución (Git en Windows no
# lo conserva).
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
CMD ["node", "server.js"]
