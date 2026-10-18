# Staging local con Docker Compose

Levanta Trendy completo (frontend, API y MySQL) en tu máquina con un solo comando y lo valida
con un smoke test. **No hay VPS**: este staging reemplaza al despliegue de prueba en un servidor
(ver [Limitaciones](#limitaciones) y [Qué falta para un despliegue real](#qué-falta-para-un-despliegue-real)).

```
navegador ──▶ nginx 127.0.0.1:8080 ──┬─ /      → frontend (build de Vite, servido por nginx)
                                     └─ /api   → backend :3000 (Express + Prisma) ──▶ MySQL 8.4 (solo red interna)
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
# 1. Copiar la plantilla (el archivo .env.staging NO se commitea)
cp staging.env.example .env.staging

# 2. GENERAR secretos propios y reemplazar en .env.staging todos los «changeme-...»
#    (MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD, JWT_SECRET, SEED_ADMIN_PASSWORD). Un secreto:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Construir y levantar. El nombre del proyecto aísla todo lo que crea Compose.
docker compose -p trendy-staging --env-file .env.staging up -d --build

# 4. Esperar a que los tres servicios estén "healthy"
docker compose -p trendy-staging --env-file .env.staging ps

# 5. Abrir http://localhost:8080 (o el STAGING_HTTP_PORT que hayas puesto)
```

**Los valores de ejemplo no arrancan.** Si `JWT_SECRET`, `SEED_ADMIN_PASSWORD` o `MYSQL_PASSWORD`
empiezan por `changeme` (o `JWT_SECRET` tiene menos de 16 caracteres), el backend aborta al
iniciar con un mensaje que dice qué variable cambiar (sin imprimir el valor). `MYSQL_ROOT_PASSWORD`
no lo valida el backend: cámbialo igual.

**Formato del env-file.** `MYSQL_USER` y `MYSQL_PASSWORD` no pueden tener `@ : / ? # %` porque van
dentro de la URL de la base (un secreto hexadecimal es seguro). Un `$` en cualquier valor se escribe
`$$`; si no, Compose lo toma como una variable. Si algo de esto está mal, el backend falla de
inmediato con el mensaje «Revisá que MYSQL_USER/MYSQL_PASSWORD no tengan @ : / ? # % y que un $ se
escriba $$ en el env-file de Compose», sin esperar los reintentos a la base.

Al arrancar, el backend valida las variables, espera a MySQL, aplica las migraciones
(`prisma migrate deploy`) y, si `RUN_SEED=true`, carga el seed (roles, categorías, 20 productos y 4
zonas de ejemplo; es idempotente) y crea el admin inicial.

### Quién puede conectarse (red local)

Por defecto nginx escucha **solo en `127.0.0.1`**: nadie más de tu red local ve el staging. Para
exponerlo a propósito (por ejemplo, probar desde un celular) pon `STAGING_BIND_ADDRESS=0.0.0.0` en
`.env.staging` y vuelve a levantar. Hazlo solo con secretos propios y sabiendo que **no hay HTTPS**:
las contraseñas y los tokens viajan en claro por tu red.

### Smoke test

```bash
STAGING_URL=http://localhost:8080 \
SMOKE_ADMIN_PASSWORD=<el SEED_ADMIN_PASSWORD que pusiste> \
node scripts/smoke-staging.js
```

- `SMOKE_ADMIN_PASSWORD` (o `SEED_ADMIN_PASSWORD`) es **obligatoria y no tiene valor por defecto**;
  el correo (`SMOKE_ADMIN_CORREO` o `SEED_ADMIN_CORREO`) es `admin@trendy.test` si no lo defines.
- Si `STAGING_URL` no es `localhost`, `127.0.0.1` ni `[::1]`, el script se niega salvo que agregues
  `SMOKE_CONFIRMAR=1`: **crea usuarios, zonas, pedidos y ventas** en ese entorno.
- Sale con código `0` si pasa todo y `1` con el resumen de lo que falló. Cubre: salud de la API,
  frontend y rutas de la SPA, catálogo, registro y login, zona con contra entrega, carrito, pedido,
  pago contra entrega, **venta registrada al confirmar y anulada al cancelar** (con reposición de
  stock) y el `503` documentado de Mercado Pago sin credenciales.
- Deja datos de prueba (un cliente nuevo por corrida, pedidos cancelados, una venta anulada). Al
  terminar, **aunque falle un chequeo**, cancela los pedidos que creó y desactiva su zona de prueba.

## Credenciales de prueba

| Rol | Cómo se obtiene |
| --- | --- |
| admin | El que defines en `SEED_ADMIN_CORREO` / `SEED_ADMIN_PASSWORD`. Es el **único** camino para tener un admin: la API no tiene endpoint para crearlo. Si ese correo ya existía, el seed no lo modifica y lo avisa en el log. |
| cliente | Registrarse desde la web o `POST /api/v1/auth/register`. |
| vendedor | No hay forma de crearlo desde la app (el registro siempre da rol cliente y no existe un endpoint que cambie el rol). Hay que insertarlo en la base a mano. |

Las variables (incluidos `SEED_ADMIN_PASSWORD` y los secretos) quedan en el entorno de los
contenedores y se ven con `docker inspect`. Es aceptable en un staging local; no lo es en un
servidor compartido.

## Operación diaria

```bash
alias dc='docker compose -p trendy-staging --env-file .env.staging'

dc logs -f backend           # logs del backend (validación, migraciones, seed, errores)
dc ps                        # estado y health de cada servicio
dc exec backend npx prisma db seed --config prisma7.config.ts          # recargar el seed
dc exec backend npx prisma migrate status --config prisma7.config.ts   # estado de migraciones
dc up -d --build             # aplicar cambios de código
dc down                      # bajar los contenedores, CONSERVANDO la base (volumen)
dc down -v                   # bajar y BORRAR la base: empezar de cero
```

**Empezar de cero:** `dc down -v` y luego `dc up -d --build`. Las migraciones y el seed se aplican
de nuevo solos. Verificado en corridas locales: cuatro levantadas desde cero (`down -v` + `up`) con
el smoke test en verde cada vez, y un `down` + `up` sin `-v` que conserva los datos.

## Solución de problemas

| Síntoma | Causa y arreglo |
| --- | --- |
| `bind: address already in use` al levantar | El puerto del host está ocupado. Cambia `STAGING_HTTP_PORT` en `.env.staging`. Para ver quién lo usa: `netstat -ano \| findstr :8080` (Windows). |
| `required variable ... is missing a value` | Falta una variable obligatoria o olvidaste `--env-file .env.staging`. |
| El backend sale con «la configuración del backend no es válida» | Es la validación del entrypoint: el mensaje dice qué variable cambiar (secreto de ejemplo, `JWT_SECRET` corto o `DATABASE_URL`/credenciales con caracteres no permitidos). Corrige `.env.staging` y `dc up -d`. |
| El backend se reinicia en bucle o queda `unhealthy` | `dc logs backend`. Si el proceso sale con error (por ejemplo, una migración fallida), Docker lo reintenta con espera creciente (`restart: unless-stopped`): corrige la causa y `dc up -d`. **Un contenedor `unhealthy` que sigue corriendo no se reinicia solo**: usa `dc restart backend`. |
| `Access denied for user` / el backend no conecta | La base se inicializó con otras credenciales: MySQL solo lee `MYSQL_*` cuando el volumen está vacío. Cambiaste una contraseña → `dc down -v` y vuelve a levantar. |
| `exec ./docker-entrypoint.sh: no such file or directory` | El script tiene fin de línea CRLF. `.gitattributes` fuerza LF; si hace falta, vuelve a clonar o ejecuta `git add --renormalize backend/docker-entrypoint.sh`. |
| Tras reiniciar MySQL el backend responde 503/500 varios minutos | Ver [Limitaciones](#limitaciones): el pool de conexiones tarda en recuperarse. `dc restart backend` lo resuelve al instante. |
| El smoke dice que falta la contraseña, o falla el login del admin | Define `SMOKE_ADMIN_PASSWORD` con el `SEED_ADMIN_PASSWORD` con el que se creó la base (el seed no pisa la contraseña de un admin existente). |

## Cambios respecto al compose anterior

Si ya usabas `docker compose up` con el compose viejo:

- Las variables ahora llegan por `--env-file` (`.env.staging`) y no por `backend/.env` ni
  `mysql/.env`; esos dos archivos dejan de usarse (el de desarrollo apuntaba a `localhost`, que
  dentro de Docker no es la base).
- nginx publica `127.0.0.1:${STAGING_HTTP_PORT}` (por defecto `8080`) en vez de `0.0.0.0:80`; usa
  `STAGING_HTTP_PORT=80` y `STAGING_BIND_ADDRESS=0.0.0.0` si lo quieres igual que antes.
- Ya no se monta `frontend/dist` hecho a mano: el frontend se construye dentro de Docker.
- MySQL (ahora fijado a `mysql:8.4`) tiene healthcheck y el backend espera a que esté sano; el
  backend tiene healthcheck (`GET /api/v1/health`) y nginx espera al backend.
- El backend corre como usuario no root, con `NODE_ENV=production`, `init: true` (`docker stop` no
  espera 10 s) y `restart: unless-stopped`.

## Decisiones de la imagen del backend

- Se instalan **todas** las dependencias (incluida la CLI de Prisma, que es `devDependency`),
  porque `prisma generate` y `prisma migrate deploy` corren dentro del contenedor. Costo observado
  en una corrida local: la imagen pesó ~965 MB. Mover `prisma` a `dependencies` con
  `npm ci --omit=dev` la reduciría, pero cambia `package.json`/`package-lock.json`; queda como
  decisión del equipo para producción.
- Las migraciones corren en el **entrypoint**, no en el `CMD`: si fallan, el contenedor sale con
  error y un mensaje claro en vez de arrancar con un esquema roto.
- El seed crea el admin inicial solo si defines `SEED_ADMIN_CORREO` y `SEED_ADMIN_PASSWORD`; nunca
  modifica un usuario existente (ni su contraseña ni su rol) y avisa si falta una de las dos
  variables.

## Limitaciones

- **Mercado Pago no se puede probar de extremo a extremo.** Sin una URL pública, Mercado Pago no
  puede llamar al webhook (`MERCADOPAGO_WEBHOOK_URL`), así que ningún pago pasa a aprobado. El
  smoke solo verifica que sin credenciales crear la preferencia responde `503`. El flujo con el
  sandbox real nunca se ha probado.
- **Sin HTTPS.** nginx escucha solo en HTTP. Los tokens JWT y las contraseñas viajan sin cifrar.
- **Los secretos de ejemplo no sirven para producción** y el backend ya no arranca con ellos, pero
  la plantilla sigue siendo pública: genera secretos propios siempre.
- **`cors()` abierto** a cualquier origen y **sin rate limiting** en las rutas de autenticación.
- **Recuperación tras reiniciar MySQL lenta.** Observado en una corrida local (no es una
  garantía): tras `stop`/`start` de MySQL el backend siguió fallando unos 4-5 minutos (el pool del
  adaptador MariaDB de Prisma no reconectaba) y se recuperó solo. Hay `healthcheck`, pero Docker no
  reinicia un contenedor `unhealthy`.
- **`/api/v1/health` sin rate limit y sin cancelar la consulta.** Responde 503 a los 3 s si la base
  no contesta, pero la consulta `SELECT 1` queda corriendo en el pool; con muchos pedidos al
  endpoint podría ocuparlo. Deuda conocida.
- **Sin respaldos** de la base ni scheduler: `POST /api/v1/pedidos/vencidos/cancelar` hay que
  invocarlo desde fuera.
- **No es un VPS.** No se probó nada de red pública, DNS, firewall ni recursos de un servidor real.

## Qué falta para un despliegue real

1. Un servidor (VPS) con dominio, DNS y firewall, y HTTPS (por ejemplo Let's Encrypt delante de nginx).
2. URL pública para el webhook de Mercado Pago, credenciales de prueba y luego de producción, y una
   prueba completa en el sandbox (pago aprobado, rechazado y pendiente).
3. Secretos reales gestionados fuera del repositorio (no en variables de entorno visibles con
   `docker inspect`), `cors()` restringido al dominio del frontend y rate limiting en
   login/registro/recuperación.
4. Respaldos automáticos de MySQL y un procedimiento de restauración probado; un scheduler para
   cancelar pedidos vencidos.
5. Imagen del backend multi-etapa y más liviana, y una política para que Docker reinicie un
   backend `unhealthy` (o resolver la reconexión del pool).
6. Un camino para crear vendedores desde la aplicación.
