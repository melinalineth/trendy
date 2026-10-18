# Staging local con Docker Compose

Levanta Trendy completo (frontend, API y MySQL) en tu máquina con un solo comando y lo valida
con un smoke test. **No hay VPS**: este staging reemplaza al despliegue de prueba en un servidor
(ver [Limitaciones](#limitaciones) y [Qué falta para un despliegue real](#qué-falta-para-un-despliegue-real)).

```
navegador ──▶ nginx :8080 ──┬─ /      → frontend (build de Vite, servido por nginx)
                            └─ /api   → backend :3000 (Express + Prisma) ──▶ MySQL 8 (solo red interna)
```

## Requisitos

- Docker Desktop (o Docker Engine) con el plugin `docker compose` v2.
- Node 20 o más nuevo, **solo** para correr el smoke test (el build del frontend y todo lo demás
  ocurre dentro de Docker).
- Un puerto libre en el host para nginx (por defecto `8080`). MySQL **no** se publica al host, así
  que no choca con un MySQL local en el `3306`.

## Primer arranque

Desde la raíz del repositorio:

```bash
# 1. Crear tu archivo de variables (NO se commitea) y editar los CAMBIAR
cp staging.env.example .env.staging

# 2. Construir y levantar. El nombre del proyecto aísla todo lo que crea Compose.
docker compose -p trendy-staging --env-file .env.staging up -d --build

# 3. Esperar a que los tres servicios estén "healthy"
docker compose -p trendy-staging --env-file .env.staging ps

# 4. Abrir http://localhost:8080 (o el STAGING_HTTP_PORT que hayas puesto)
```

Al arrancar, el backend espera a MySQL, aplica las migraciones (`prisma migrate deploy`) y, si
`RUN_SEED=true`, carga el seed (roles, categorías, 20 productos y 4 zonas de ejemplo; es
idempotente) y crea el admin inicial.

### Smoke test

```bash
STAGING_URL=http://localhost:8080 \
SMOKE_ADMIN_CORREO=<SEED_ADMIN_CORREO> \
SMOKE_ADMIN_PASSWORD=<SEED_ADMIN_PASSWORD> \
node scripts/smoke-staging.js
```

Sale con código `0` si pasa todo y `1` con el resumen de lo que falló. Cubre: salud de la API,
frontend y rutas de la SPA, catálogo, registro y login, zona con contra entrega, carrito, pedido,
pago contra entrega, **venta registrada al confirmar y anulada al cancelar** (con reposición de
stock) y el `503` documentado de Mercado Pago sin credenciales. Deja datos de prueba (un cliente
nuevo por corrida, pedidos cancelados, una venta anulada); la zona que crea la desactiva al final.

## Credenciales de prueba

| Rol | Cómo se obtiene |
| --- | --- |
| admin | El que defines en `SEED_ADMIN_CORREO` / `SEED_ADMIN_PASSWORD` (plantilla: `admin@trendy.test`). Es el **único** camino para tener un admin: la API no tiene endpoint para crearlo. |
| cliente | Registrarse desde la web o `POST /api/v1/auth/register`. |
| vendedor | No hay forma de crearlo desde la app (el registro siempre da rol cliente y no existe un endpoint que cambie el rol). Hay que insertarlo en la base a mano. |

Los valores de `staging.env.example` son placeholders: cámbialos. Para generar secretos:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Usa valores sin
`@ : / ? # %` porque van dentro de la URL de la base.

## Operación diaria

```bash
alias dc='docker compose -p trendy-staging --env-file .env.staging'

dc logs -f backend           # logs del backend (migraciones, seed, errores)
dc ps                        # estado y health de cada servicio
dc exec backend npx prisma db seed --config prisma7.config.ts          # recargar el seed
dc exec backend npx prisma migrate status --config prisma7.config.ts   # estado de migraciones
dc up -d --build             # aplicar cambios de código
dc down                      # bajar los contenedores, CONSERVANDO la base (volumen)
dc down -v                   # bajar y BORRAR la base: empezar de cero
```

**Empezar de cero:** `dc down -v` y luego `dc up -d --build`. Las migraciones y el seed se aplican
de nuevo solos. Verificado: dos ciclos completos desde cero con el smoke test en verde, y un
`down` + `up` sin `-v` conserva los datos.

## Solución de problemas

| Síntoma | Causa y arreglo |
| --- | --- |
| `bind: address already in use` al levantar | El puerto del host está ocupado. Cambia `STAGING_HTTP_PORT` en `.env.staging`. Para ver quién lo usa: `netstat -ano \| findstr :8080` (Windows). |
| `required variable ... is missing a value` | Falta una variable obligatoria o olvidaste `--env-file .env.staging`. |
| El backend queda `unhealthy` o se detiene | `dc logs backend`. Si falló una migración, el contenedor sale con error y reintenta hasta 5 veces (`restart: on-failure:5`): corrige la causa y `dc up -d`. No entra en un loop infinito. |
| `Access denied for user` / el backend no conecta | La base se inicializó con otras credenciales: MySQL solo lee `MYSQL_*` cuando el volumen está vacío. Cambiaste una contraseña → `dc down -v` y vuelve a levantar. |
| La URL de la base falla con caracteres raros | La contraseña tiene `@ : / ? # %`. Usa una sin esos caracteres (por ejemplo, hexadecimal). |
| `exec ./docker-entrypoint.sh: no such file or directory` | El script tiene fin de línea CRLF. `.gitattributes` fuerza LF; si hace falta, vuelve a clonar o ejecuta `git add --renormalize .`. |
| Tras reiniciar MySQL el backend responde 503/500 varios minutos | Ver [Limitaciones](#limitaciones): el pool de conexiones tarda en recuperarse. `dc restart backend` lo resuelve al instante. |
| El smoke falla en login del admin | `SMOKE_ADMIN_CORREO`/`SMOKE_ADMIN_PASSWORD` no coinciden con `SEED_ADMIN_*` con los que se creó la base (el seed no pisa la contraseña de un admin existente). |

## Cambios respecto al compose anterior

Si ya usabas `docker compose up` con el compose viejo:

- Las variables ahora llegan por `--env-file` (`.env.staging`) y no por `backend/.env` ni
  `mysql/.env`; esos dos archivos dejan de usarse (el de desarrollo apuntaba a `localhost`, que
  dentro de Docker no es la base).
- nginx publica `STAGING_HTTP_PORT` (por defecto `8080`) en vez del `80`; pon `80` si lo quieres igual.
- Ya no se monta `frontend/dist` hecho a mano: el frontend se construye dentro de Docker.
- MySQL tiene healthcheck y el backend espera a que esté sano; el backend tiene healthcheck
  (`GET /api/v1/health`) y nginx espera al backend.
- El backend corre como usuario no root, con `NODE_ENV=production`.

## Decisiones de la imagen del backend

- Se instalan **todas** las dependencias (incluida la CLI de Prisma, que es `devDependency`),
  porque `prisma generate` y `prisma migrate deploy` corren dentro del contenedor. Costo: la imagen
  pesa ~960 MB. Mover `prisma` a `dependencies` con `npm ci --omit=dev` la reduciría, pero cambia
  `package.json`/`package-lock.json`; queda como decisión del equipo para producción.
- Las migraciones corren en el **entrypoint**, no en el `CMD`: si fallan, el contenedor sale con
  error y un mensaje claro en vez de arrancar con un esquema roto.
- El seed crea el admin inicial solo si defines `SEED_ADMIN_CORREO` y `SEED_ADMIN_PASSWORD`; nunca
  pisa la contraseña de un admin existente.

## Limitaciones

- **Mercado Pago no se puede probar de extremo a extremo.** Sin una URL pública, Mercado Pago no
  puede llamar al webhook (`MERCADOPAGO_WEBHOOK_URL`), así que ningún pago pasa a aprobado. El
  smoke solo verifica que sin credenciales crear la preferencia responde `503`. El flujo con el
  sandbox real nunca se ha probado.
- **Sin HTTPS.** nginx escucha solo en HTTP. Los tokens JWT y las contraseñas viajan sin cifrar.
- **Los secretos de ejemplo no sirven para producción.** `staging.env.example` solo trae placeholders.
- **`cors()` abierto** a cualquier origen y **sin rate limiting** en las rutas de autenticación.
- **Recuperación tras reiniciar MySQL lenta.** Medido: tras `stop`/`start` de MySQL el backend
  siguió fallando unos 4-5 minutos (el pool del adaptador MariaDB de Prisma no reconectaba) y se
  recuperó solo. Hay `healthcheck`, pero Docker no reinicia un contenedor `unhealthy`.
- **Sin respaldos** de la base ni scheduler: `POST /api/v1/pedidos/vencidos/cancelar` hay que
  invocarlo desde fuera.
- **No es un VPS.** No se probó nada de red pública, DNS, firewall ni recursos de un servidor real.

## Qué falta para un despliegue real

1. Un servidor (VPS) con dominio, DNS y firewall, y HTTPS (por ejemplo Let's Encrypt delante de nginx).
2. URL pública para el webhook de Mercado Pago, credenciales de prueba y luego de producción, y una
   prueba completa en el sandbox (pago aprobado, rechazado y pendiente).
3. Secretos reales gestionados fuera del repositorio, `cors()` restringido al dominio del frontend
   y rate limiting en login/registro/recuperación.
4. Respaldos automáticos de MySQL y un procedimiento de restauración probado; un scheduler para
   cancelar pedidos vencidos.
5. Imagen del backend multi-etapa y más liviana, y una política para que Docker reinicie un
   backend `unhealthy` (o resolver la reconexión del pool).
6. Un camino para crear vendedores desde la aplicación.
