# Trendy

E-commerce de ropa: catálogo público, carrito, pedidos, pagos (Mercado Pago y contra entrega),
seguimiento de envíos y registro de ventas, con paneles para administradores y vendedores.
Proyecto del equipo SENATIC (MVP v1.0).

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | React 19 + Vite, React Router, axios |
| Backend | Node 20, Express 5 (CommonJS), validación con zod, JWT, bcrypt |
| Base de datos | MySQL 8 con Prisma 7.10 (adaptador MariaDB) |
| Pagos | Mercado Pago (Checkout Pro) y contra entrega |
| Infraestructura | Docker Compose: nginx + backend + MySQL |

## Estructura

```
backend/
  prisma/            schema.prisma, migrations/, seed.js
  prisma7.config.ts  configuración de Prisma (hay que pasarla con --config)
  src/
    routes/          un archivo por módulo, con el path completo bajo /api/v1
    controllers/     delgados: validan y delegan
    services/        reglas de negocio
    repositories/    acceso a datos (Prisma)
    dtos/            validación de entrada
    middlewares/     auth (JWT), roleGuard, errorHandler
    config/prisma.js la ÚNICA instancia de PrismaClient
  tests/             tests con node:test
frontend/src/        pages, components, hooks, services, context, router, styles (tokens.css)
nginx/conf.d/        proxy de /api y fallback de la SPA (staging)
scripts/             smoke-staging.js, crear-usuario.js, datos-demo.js
docs/                ERS, DDS y Plan de Trabajo (.docx), bitácoras y diseño técnico
```

## Requisitos

- Node 20 o más nuevo y npm.
- MySQL 8 (local o en Docker) para desarrollo y para los tests.
- Docker Desktop, solo para el staging.

## Desarrollo local

### 1. Base de datos

Crea una base vacía (por ejemplo `trendy`) y un usuario con permisos sobre ella.

### 2. Backend

```bash
cd backend
npm ci
cp .env.example .env        # y completarlo (ver "Variables de entorno")
npx prisma migrate deploy --config prisma7.config.ts   # aplica las migraciones
npx prisma db seed --config prisma7.config.ts          # roles, categorías, productos y zonas
npm run dev                 # nodemon en http://localhost:3000
```

Todos los comandos de Prisma llevan `--config prisma7.config.ts`: el archivo no se llama
`prisma.config.ts`, el nombre que Prisma busca por defecto. Para generar el cliente a mano:
`npx prisma generate --config prisma7.config.ts`. En producción: `npm start`.

El seed **no crea usuarios**. Para tener un admin en un entorno nuevo define
`SEED_ADMIN_CORREO` y `SEED_ADMIN_PASSWORD` (mínimo 8 caracteres) antes de correr el seed.

### 3. Frontend

```bash
cd frontend
npm ci
echo "VITE_API_URL=http://localhost:3000/api/v1" > .env.local
npm run dev                 # Vite, normalmente http://localhost:5173
npm run lint
```

Si no defines `VITE_API_URL`, el frontend usa `/api/v1` (mismo origen), que es lo que usa el
staging con nginx. El servidor de desarrollo de Vite no tiene proxy, por eso en desarrollo hace
falta la variable.

### Cómo crear un vendedor o un administrador

La aplicación no tiene pantalla ni endpoint para crearlos (el registro siempre da rol cliente).
`scripts/crear-usuario.js` crea un usuario con rol `admin`, `vendedor` o `cliente` en la base de
`backend/.env` (hace falta haber corrido las migraciones y el seed, que crea los roles). La
contraseña va **solo** por la variable `NUEVO_USUARIO_PASSWORD` (mínimo 8 caracteres, sin empezar por
`changeme`); nunca por argumento:

```bash
# desde la raíz del repositorio
export NUEVO_USUARIO_PASSWORD='<elige una clave>'
node scripts/crear-usuario.js --correo vendedor@ejemplo.com --nombre "Vendedor Ejemplo" --rol vendedor
```

Si el correo ya existe no modifica nada (ni la contraseña ni el rol) y avisa qué rol tiene. No imprime
la contraseña ni su hash. Termina con código 0 si creó el usuario o ya existía, y 1 ante cualquier error.
Para la demo, ver [docs/manual/guion-demo.md](docs/manual/guion-demo.md).

### Datos de demostración

`scripts/datos-demo.js` carga en tu base **local** una tienda con vida: cuentas de admin, vendedor y 4
clientes (`@trendy.test`), pedidos contra entrega en todos los estados, ventas registradas y anuladas,
stock bajo y contra entrega por zona. Con el backend levantado: `node scripts/datos-demo.js`
(`--verificar` solo comprueba el entorno, `--ayuda` explica el uso). **No borra nada**, pero sí modifica
algo de lo existente: habilita el contra entrega en Bogotá, Medellín y Cali, ajusta el stock de ~6
variantes con movimientos (quedan en el historial) y retrasa la fecha de creación de las cuentas que
crea. Se niega a correr contra algo que no sea local y aborta si la demo ya está cargada (o si quedó
incompleta: entonces hace falta una base nueva o limpiar a mano).

**Seguridad:** la contraseña compartida de las cuentas es `DATOS_DEMO_PASSWORD` si la definís (mínimo 8
caracteres) o, si no, la constante `PASSWORD_DEMO` del propio script, que es **pública** (está en el
repositorio). Como el backend escucha en todas las interfaces de red (`app.listen(PORT)` sin host), con
la demo cargada queda `demo-admin@trendy.test` (rol admin) con una clave conocida si usás la constante:
usá una red de confianza o definí `DATOS_DEMO_PASSWORD` antes de la primera corrida. La guarda de la API
solo mira el host (un `localhost:3000` que fuera un túnel o apuntara a otra base pasaría). Detalle y
límites (sin Mercado Pago, fechas retrasadas directo en la base) en la sección 3.3 de
[docs/manual/guion-demo.md](docs/manual/guion-demo.md).

## Tests del backend

Los tests HTTP escriben en la base. `tests/helpers/entorno.js` se niega a correr si el nombre de la
base de `DATABASE_URL` no contiene **`test`** o **`scratch`** (por ejemplo `trendy_test`), para que
una corrida con tu `.env` de desarrollo no ensucie datos reales. Prepara una base descartable:

```bash
cd backend
export DATABASE_URL="mysql://usuario:clave@localhost:3306/trendy_test"
npx prisma migrate deploy --config prisma7.config.ts
npx prisma db seed --config prisma7.config.ts         # los tests necesitan los roles del seed
DOTENV_CONFIG_QUIET=true node --require dotenv/config --test --test-concurrency=1
```

- `--test-concurrency=1` es obligatorio: todos los archivos comparten la misma base. Es lo que
  hace `npm test`.
- `--require dotenv/config` hace falta si dependes del `.env`: el único `require("dotenv")` de
  `tests/` está en `tests/helpers/entorno.js`. Los archivos que importan `config/prisma` (directo o
  por un service) **sin pasar por ese helper** —por ejemplo `montos.test.js`— no cargan el `.env`, y
  `config/prisma.js` necesita `DATABASE_URL` para armar el adaptador (sin ella fallan con
  `Cannot read properties of undefined`). Una variable exportada en el shell tiene prioridad sobre
  el `.env`, así que `export DATABASE_URL=...` más `npm test` también funciona.
- Para un solo archivo: `... --test --test-concurrency=1 tests/venta.consulta.http.test.js`.
- `tests/health.http.test.js` y varios tests unitarios no necesitan una **base** viva, pero sí
  `node_modules` (`npm ci`) y el cliente de Prisma generado
  (`npx prisma generate --config prisma7.config.ts`).

El frontend no tiene tests automáticos; se valida con `npm run lint` y revisión manual.

## Variables de entorno

Las plantillas son `backend/.env.example` y `mysql/.env.example` (desarrollo) y
`staging.env.example` (Docker Compose). Lo que el código lee:

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión de Prisma, ej. `mysql://usuario:clave@host:3306/base` |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Firma de tokens (vigencia por defecto `1h`) |
| `PORT` | Puerto del backend (por defecto `3000`) |
| `MERCADOPAGO_ACCESS_TOKEN` | Credencial de **prueba** de Mercado Pago; sin ella crear una preferencia responde `503` |
| `MERCADOPAGO_WEBHOOK_SECRET` | Secreto para validar la firma del webhook |
| `MERCADOPAGO_WEBHOOK_URL` | URL **pública** a la que Mercado Pago notifica |
| `MERCADOPAGO_PREFERENCIA_HORAS` | Vigencia de la preferencia, 1 a 168 (por defecto 24) |
| `SEED_ADMIN_CORREO`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NOMBRE` | Admin inicial opcional del seed |
| `VITE_API_URL` | (frontend) URL base de la API, por defecto `/api/v1` |

`backend/src/config/database.js` (pool de `mysql2` con `DB_*`) no lo importa ningún archivo.
Nunca commitees `.env`; los reales están en `.gitignore`.

## Roles y funcionalidades

| Rol | Qué hace |
| --- | --- |
| Visitante | Registrarse, iniciar sesión, recuperar contraseña, ver el catálogo (filtros y búsqueda) y el detalle de producto |
| Cliente | Direcciones, carrito, checkout, pedidos propios con seguimiento del paso actual del envío (la API entrega el historial, pero la pantalla no lo dibuja), pago con Mercado Pago o contra entrega |
| Vendedor | Productos, imágenes y variantes, inventario, gestión de pedidos y del envío, consulta de ventas (ve todas) |
| Administrador | Todo lo del vendedor, más usuarios, activación de vendedores, roles y permisos, zonas de cobertura y tarifas, contra entrega por zona y cancelación de pedidos vencidos |

Reglas que conviene conocer (detalle en `docs/diseno/`):

- El stock se descuenta al crear el pedido y se repone al cancelarlo.
- La **venta** nace cuando el pedido queda confirmado y se **anula** (nunca se borra) si se cancela
  un contra entrega confirmado. La cancelación la hace el personal; la del cliente es de la v2.0.
- Todos los montos son pesos colombianos (COP) enteros.
- Diferidos a la v2.0 (ERS §2.8.3), entre otros: RF-033 (cancelar por el cliente), RF-040
  (notificaciones), RF-043 y RF-044 (reportes).

## Staging con Docker Compose

```bash
cp staging.env.example .env.staging        # 1. copiar la plantilla
# 2. GENERAR secretos propios y reemplazar todos los «changeme-...» en .env.staging:
#    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
docker compose -p trendy-staging --env-file .env.staging up -d --build   # 3. levantar
SMOKE_ADMIN_PASSWORD=<tu SEED_ADMIN_PASSWORD> node scripts/smoke-staging.js
```

El backend **no arranca** con los valores de ejemplo (`changeme...`), nginx escucha solo en
`127.0.0.1` y el smoke test exige la contraseña del admin por entorno. Guía completa, problemas
frecuentes y limitaciones: [docs/despliegue/staging.md](docs/despliegue/staging.md).

## Estado del proyecto

Verificado:

- Revisión y QA manual de los Sprints 1, 3 y 4 (ver `docs/bitacora/`).
- Sprint 5: registro y consulta de ventas, anulación con `anuladaPorId`, expuesto como `anuladaPor` en la API y en el detalle de la venta.
- El staging local levanta desde cero (migraciones + seed + admin) y el smoke test pasa con compra
  contra entrega, venta registrada, cancelación y venta anulada (verificado en corridas locales con
  Docker Desktop; no es una garantía para otros entornos).

No verificado / pendiente:

- **Mercado Pago real nunca se probó en el sandbox**: el webhook necesita una URL pública y el
  staging es local.
- No hay despliegue en un servidor real, HTTPS ni respaldos (ver la guía de staging).
- No hay forma de crear vendedores desde la aplicación ni de crear el primer admin sin el seed (se
  crean con `scripts/crear-usuario.js`, ver arriba).
- Pendiente: completar la navegación y otros huecos de uso (el menú de usuario ya ofrece las pantallas
  de cada rol y «Cerrar sesión», pero no tiene entrada «Panel»; la página de inicio es una portada simple
  y sus categorías no preseleccionan el filtro del catálogo). Están documentados en la sección «Límites conocidos» de
  [`docs/manual/manual-usuario.md`](docs/manual/manual-usuario.md).
- El contra entrega se habilita y deshabilita por zona desde `/admin/envios` (columna «Contra
  entrega» y botones por zona). Esa pantalla se verificó en el navegador al integrarla (PR #48); el
  flujo completo de la demo con ese paso no se ensayó de punta a punta.

## Documentación

- Requisitos y diseño: `docs/Trendy_ERS_v1.2.docx`, `docs/Trendy_DDS_v1.2.docx`,
  `docs/Trendy_Plan_de_Trabajo_v1.0.docx`; mapas de pantallas en `docs/*.png`.
- Diseño técnico: [estados del pedido, envío y pago](docs/diseno/pedidos-estados.md),
  [info de envío e historial](docs/diseno/info-envio.md), [API de ventas](docs/diseno/ventas-api.md),
  [montos en COP](docs/diseno/montos-cop.md).
- Manuales: [manual de usuario](docs/manual/manual-usuario.md) (cliente, vendedor y administrador) y
  [guion de demo](docs/manual/guion-demo.md) (preparación, relato y preguntas del jurado).
- Bitácoras de sprint: `docs/bitacora/`.
- Despliegue: [docs/despliegue/staging.md](docs/despliegue/staging.md).

## Equipo y convenciones

Equipo (según el historial de Git): Oscar Pérez, Melina Ruidiaz, Valentina Linares y Valentina Ortiz.

- **Ramas:** se trabaja en ramas `feat/...`, `fix/...` o `chore/...` que se integran por
  Pull Request a la rama base del sprint (`sprint-5-base` en el sprint actual). **A `main` solo se
  entra por Pull Request**, nunca con push directo.
- **Merge:** con *merge commit* (no squash ni rebase), para conservar la historia de cada rama.
- **Commits convencionales en español:** `feat(RF-041): ...`, `fix(pedidos): ...`, `docs(...)`,
  `test(...)`, `refactor(...)`, `chore(infra): ...`.
- **Código:** Controller → Service → Repository; un solo `PrismaClient` en
  `backend/src/config/prisma.js`; cada archivo de rutas declara el path completo bajo `/api/v1`;
  los errores salen como `{ error: { codigo, mensaje, detalles } }` vía `errorHandler.js` (siempre
  el último middleware; justo antes va `rutaNoEncontrada.js`, que responde 404 `RUTA_NO_ENCONTRADA`
  a las URLs sin ruta); estilos del frontend solo con los tokens de `frontend/src/styles/tokens.css`.
