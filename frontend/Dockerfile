# Imagen del frontend de Trendy (staging): el build de Vite ocurre DENTRO de
# Docker, así no hace falta Node ni `npm run build` en el host.
#
# Etapa 1 (build): instala dependencias y genera `dist`.
# Etapa 2 (runtime): nginx sirve `dist`. La configuración del sitio (proxy de
# /api hacia el backend y fallback de la SPA) se monta desde nginx/conf.d en
# docker-compose.yml.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# apiClient.js usa VITE_API_URL y, si no existe, "/api/v1". Con nginx haciendo
# proxy en el mismo origen la URL relativa alcanza y no hay problemas de CORS.
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
