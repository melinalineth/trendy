FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Staging: instalamos todas las dependencias para disponer de Prisma CLI.
# Esto simplifica el despliegue y evita mover prisma a dependencies.
RUN npm ci

COPY . .

# Genera el cliente para el esquema de Prisma del proyecto.
RUN npx prisma generate --config prisma7.config.ts

EXPOSE 3000

# Las migraciones se ejecutan manualmente durante el despliegue,
# no en CMD, para evitar ciclos de reinicio si alguna falla.
CMD ["node", "server.js"]