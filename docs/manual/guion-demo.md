# Guion de demo de Trendy (12 a 15 minutos)

Guía para quien presenta. Cada paso dice **qué hago**, **qué digo**, **qué debe pasar** y **plan B si
falla**. El relato de los bloques 0 a 7 con la opción A (desarrollo local) se recorrió de punta a
punta en la aplicación real, con los textos de pantalla copiados tal cual. **No** se ensayó la opción B
(Docker), el paso 3.4 (habilitar el contra entrega desde la pantalla) dentro del flujo completo, ni el
plan B de cancelar desde «Confirmado» saltando el envío (ver la nota del bloque 3); el detalle está en
[Cómo se ensayó](#cómo-se-ensayó). Para el detalle de cada pantalla, el [manual de usuario](manual-usuario.md).

**Datos de demo:** el relato se ensayó con datos armados a mano; ahora hay un script que carga una
tienda completa (`scripts/datos-demo.js`, ver 3.3). Con esos datos **las cifras y los totales serán
distintos** de los que figuran en los textos del guion: confiá en lo que muestra la pantalla.

## 1. Objetivo y público

**Objetivo:** que el jurado vea que Trendy resuelve el ciclo completo de una venta —un cliente compra,
la tienda confirma, la venta queda registrada y, si hace falta, se cancela con trazabilidad— y que
entienda con honestidad qué está probado y qué no.

**Público:** jurado de entrega del proyecto (31/10/2026): perfil mixto, técnico y de negocio. Conviene
hablar de reglas de negocio primero y de técnica solo si preguntan.

**Historia que se cuenta:** cliente compra con contra entrega → el administrador confirma y aparece la
venta → un vendedor cancela y la venta queda «Anulada por» él → el panel de ventas con filtros y
totales → un error legible (precio con centavos).

## 2. Duración por bloque

| # | Bloque | Quién actúa | Tiempo |
| --- | --- | --- | --- |
| 0 | Apertura | Presentador | 1:00 |
| 1 | El cliente compra con pago contra entrega | Cliente | 3:30 |
| 2 | La tienda confirma y nace la venta | Administrador | 2:00 |
| 3 | Cancelación por un vendedor y «Anulada por» | Vendedor | 2:30 |
| 4 | Panel de ventas: filtros y totales | Vendedor o administrador | 1:30 |
| 5 | Un error legible: precio con centavos | Vendedor | 1:00 |
| 6 | Mercado Pago: el aviso previsto y lo que falta | Cliente | 1:00 |
| 7 | Cierre | Presentador | 1:00 |
| | **Total** | | **13:30** |

Sobran 1 a 1:30 de colchón. Si vas justo de tiempo, **cortá el bloque 6** (se explica de palabra) y,
en el bloque 3, saltá directo de «Confirmado» a «Cancelar pedido» (con los textos distintos que
indica la nota del bloque 3). Las preguntas van aparte
(sección 7).

## 3. Preparación (15 minutos antes)

### 3.1 Opciones de entorno

- **Opción A, desarrollo local** (la que usa este guion): backend y frontend con `npm run dev`, MySQL
  local. Es la que se ensayó.
- **Opción B, staging con Docker:** Trendy completo (nginx + backend + MySQL) con Docker Compose, según
  [docs/despliegue/staging.md](../despliegue/staging.md) (comandos `docker compose -p trendy-staging
  --env-file .env.staging up -d --build`, abrir `http://localhost:8080`). **No se probó para este
  guion**; la guía allí describe cómo crear el admin (`SEED_ADMIN_*`) y aclara que crear el vendedor
  en ese staging no está cubierto: `scripts/crear-usuario.js` **no** se puede usar dentro del
  contenedor (la imagen del backend no incluye `scripts/`) ni llega a la base, que no se publica al
  host. El cliente de la demo se puede registrar desde `/registro`; sin vendedor, las acciones de los
  bloques 3 a 5 se harían con el admin y se pierde el contraste entre «Responsable» y «Anulada por».
  **Ojo con los puertos y las direcciones:** en la opción B todo entra por `http://localhost:8080`
  (nginx), la API está en `http://localhost:8080/api/v1` y **no** existen `:3000` ni `:5173`. Donde
  este guion dice `http://localhost:3000/api/v1` (3.2, 3.7), usá esa dirección, y donde dice
  `http://localhost:5173` (las pantallas), usá `http://localhost:8080`; el correo del admin es el que
  pusiste en `SEED_ADMIN_CORREO`.

### 3.2 Levantar la opción A

Usá una **base de datos solo para la demo** (por ejemplo `trendy_demo`), nunca la de desarrollo con
datos reales. **Primero creala vacía**, junto con un usuario de MySQL con permisos sobre ella (es el
paso «1. Base de datos» del [README](../../README.md#desarrollo-local)); por ejemplo, desde un cliente
MySQL con un usuario administrador: `CREATE DATABASE trendy_demo;`. Sin ese paso, `prisma migrate
deploy` falla porque la base no existe (las migraciones no la crean).

Después, **todos los comandos se corren desde la raíz del repositorio** (comandos de
[README.md](../../README.md)); la segunda terminal también arranca en la raíz:

```bash
# 1. Backend (terminal 1, desde la raíz del repositorio)
cd backend
npm ci
cp .env.example .env        # completá DATABASE_URL (la base de demo), JWT_SECRET, etc.
npx prisma migrate deploy --config prisma7.config.ts
npx prisma db seed --config prisma7.config.ts     # roles, categorías, 20 productos, 4 zonas
npm run dev                 # http://localhost:3000

# 2. Frontend (terminal 2, también desde la raíz del repositorio: NO desde backend/)
cd frontend
npm ci
echo "VITE_API_URL=http://localhost:3000/api/v1" > .env.local
npm run dev                 # http://localhost:5173
```

Comprobá que `http://localhost:3000/api/v1/health` responde `{"estado":"ok"}` y que
`http://localhost:5173/catalogo` muestra los productos.

**Verificación previa para el bloque 6 (Mercado Pago sin configurar).** El aviso del bloque 6 (error
`CONFIGURACION_PAGOS_INCOMPLETA`, HTTP 503) solo aparece si `MERCADOPAGO_ACCESS_TOKEN` está **vacía o
ausente** en `backend/.env`. Comprobalo sin imprimir su valor (desde la raíz del repositorio):

```bash
rg -q "^MERCADOPAGO_ACCESS_TOKEN=\s*\S" backend/.env && echo "CONFIGURADA: vaciala" || echo "vacía o ausente: bien"
```

Tampoco tiene que estar exportada en la terminal donde corre el backend (una variable del shell
pisa al archivo). Reiniciá `npm run dev` después de cambiarla. Si queda configurada, en el paso 6.1
no verás el aviso: se abrirá Mercado Pago, o fallará de otra forma; en ese caso saltá el bloque 6 y
explicalo de palabra.

### 3.3 Cargar los usuarios y los datos de demo (`scripts/datos-demo.js`)

La aplicación **no tiene pantalla para crear vendedores ni administradores** (el registro siempre da
rol cliente) y armar a mano una tienda con pedidos en todos los estados lleva más de una hora. Por eso
hay un script que lo hace por vos. Con el backend levantado (3.2), desde la raíz del repositorio:

```bash
node scripts/datos-demo.js --verificar   # opcional: solo comprueba el entorno, no crea nada
node scripts/datos-demo.js               # carga la demo (tarda unos segundos)
```

**Qué crea** (todo con correos `@trendy.test` y nombres ficticios):

| Qué | Detalle |
| --- | --- |
| Personal | `demo-admin@trendy.test` (Administrador Demo, rol admin) y `demo-vendedor@trendy.test` (Vendedor Demo, rol vendedor) |
| Clientes | `demo-cliente1@trendy.test` (Bogotá), `demo-cliente2@trendy.test` (Medellín), `demo-cliente3@trendy.test` (Cali) y `demo-cliente4@trendy.test` (Barranquilla), cada uno con su dirección principal |
| Contra entrega | Habilitado en Bogotá, Medellín y Cali; **Barranquilla queda sin habilitar** (el cliente 4 tiene un producto en el carrito para mostrar el rechazo) |
| Inventario | Tres variantes en stock bajo (Camiseta Básica L Negro, Jean Clásico 30 Azul, Chaqueta de Cuero M Negro), una agotada (Vestido Negro L Negro) y dos entradas de reposición |
| Pedidos | 11 pedidos contra entrega de los clientes 1 a 3, repartidos en los últimos ~14 días: 2 pendientes, 1 confirmado, 1 en preparación, 1 enviado, 1 en tránsito, 3 entregados (con el cobro registrado) y 2 cancelados (uno pendiente y otro ya enviado, este con la venta «Anulada por» el vendedor) |
| Ventas | 8 ventas: 7 registradas y 1 anulada, con responsables distintos (administrador y vendedor) |

**Las cuentas comparten una sola contraseña.** Si definís la variable de entorno `DATOS_DEMO_PASSWORD`
(mínimo 8 caracteres, sin empezar por «changeme») se usa esa; si no, la constante `PASSWORD_DEMO` del
principio de `scripts/datos-demo.js` (no se copia acá a propósito; el script nunca la imprime). **Esa
constante es pública: está en el repositorio.** Elegí la contraseña **antes** de la primera corrida:
después no cambia la de las cuentas ya creadas.

> **Seguridad:** el backend escucha en **todas las interfaces de red** (`app.listen(PORT)` sin host).
> Con la demo cargada queda `demo-admin@trendy.test` (rol **admin**) con una clave conocida si usás la
> constante pública. Corré la demo en una red de confianza o definí `DATOS_DEMO_PASSWORD` antes de la
> primera corrida (por ejemplo `DATOS_DEMO_PASSWORD='<elegí una clave>' node scripts/datos-demo.js`). Si
> la definís, es **tu** clave: guardala en tu gestor y usala para iniciar sesión en las cuentas demo.

**Cómo se comporta:**

- **Solo local.** Se niega a correr si la API (`DATOS_DEMO_API`, por defecto
  `http://localhost:3000/api/v1`) no es `localhost`/`127.0.0.1`, si el host de la `DATABASE_URL` de
  `backend/.env` no es local o si esa URL trae en su query string claves de conexión (`host`,
  `socketPath`, etc.) que desviarían la conexión. Tampoco sigue redirecciones HTTP.
- **No borra nada, pero sí modifica algo de lo existente.** Qué cambia exactamente: **(1)** habilita el
  contra entrega en las zonas **Bogotá, Medellín y Cali** (Barranquilla no se toca: tiene que estar sin
  contra entrega, y si no lo está el script aborta sin crear nada); **(2)** cambia el stock de unas **6
  variantes existentes** mediante movimientos de ajuste (quedan en el historial de cada variante); y
  **(3)** retrasa la fecha de creación de las cuentas que crea (nunca la de una cuenta que ya existía).
  **No resetea la base.**
- **Protegido contra repetir.** Si ya existe alguno de los `demo-cliente1..4@trendy.test` aborta con
  código 1 y no crea nada. Si la carga anterior terminó, dice «ya están cargados»; si se interrumpió
  (hay clientes demo pero faltan pedidos), dice **«CARGA INCOMPLETA»**: el script no puede reanudarla
  ni borra lo que quedó, así que hay que usar una base nueva o limpiar a mano los datos demo (cuentas
  `@trendy.test`, sus pedidos y los movimientos de inventario de la demo). Ante Ctrl+C o un error
  inesperado a mitad de la carga imprime un aviso de «datos parciales».
- **Límite de la guarda de la API.** Solo mira el host: un `localhost:3000` que en realidad sea un túnel,
  o un backend que use **otra** base distinta de la de `backend/.env`, pasaría la guarda. La mitigación
  que existe: si la base es otra, el login de las cuentas de personal falla con 401 y el script aborta,
  pero **recién después de crear esas dos cuentas** en la base de `backend/.env`.
- Si una llamada a la API falla, muestra el paso, el estado HTTP y el código de error, y se detiene.
  Al final imprime un resumen (pedidos por estado, ventas, cuentas, zonas y variantes en stock bajo).

**Límites que conviene conocer:**

- **No hay pedidos de Mercado Pago:** sin un access token real no se pueden ejercitar. El bloque 6 sigue
  siendo el aviso previsto.
- **Las fechas se retrasan directo en la base** (la API siempre pone «ahora»): pedido, historial de
  envío, pago, venta y movimientos de stock de los pedidos. Los números de pedido (`PED-...`) llevan el
  instante real de creación, así que no coinciden con las fechas mostradas.
- **Un cliente no puede cancelar** (la API responde 403): el pedido «cancelado a pedido del cliente» lo
  cancela el vendedor mientras estaba pendiente.
- El **relato se ensayó con otros datos**: cifras, totales y cantidades de pedidos y ventas serán
  distintas de las que dicen los textos de este guion. Mirá siempre el número real en pantalla.
- Las ventas y pedidos de la base de desarrollo que ya existían (por ejemplo los del usuario
  `cliente1@trendy.com`) siguen apareciendo mezclados con los de la demo.

**Alternativa manual** (solo si no podés usar el script): `scripts/crear-usuario.js` crea de a un usuario;
la contraseña va **solo** por la variable `NUEVO_USUARIO_PASSWORD` (mínimo 8 caracteres, sin empezar por
«changeme») y no hay que anotarla en el repositorio:

```bash
# Git Bash / Linux / macOS (desde la raíz del repositorio)
export NUEVO_USUARIO_PASSWORD='<elegí una clave>'
node scripts/crear-usuario.js --correo demo-admin@trendy.test    --nombre "Administrador Demo" --rol admin
node scripts/crear-usuario.js --correo demo-vendedor@trendy.test --nombre "Vendedor Demo"      --rol vendedor
node scripts/crear-usuario.js --correo demo-cliente1@trendy.test --nombre "Cliente Demo"       --rol cliente
```

En PowerShell: `$env:NUEVO_USUARIO_PASSWORD='<elegí una clave>'` y los mismos `node ...`. Si el correo ya
existe el script no cambia nada y dice qué rol tiene. Con esta vía manual hacen falta 3.4 y 3.5 completos.

### 3.4 Habilitar el contra entrega en Bogotá (obligatorio)

**Si cargaste los datos con el script (3.3), este paso ya está hecho:** Bogotá, Medellín y Cali quedan
con contra entrega habilitado; solo comprobalo en `/admin/envios`. El resto de esta sección es para la
vía manual.

Las zonas del seed nacen **sin** contra entrega. Sin este paso, el cliente de la demo no podrá pagar
contra entrega. Se habilita desde la pantalla de zonas, con la sesión de administrador (es la ventana B
de 3.6: si todavía no iniciaste sesión, hacelo ahora con `demo-admin@trendy.test`):

1. Abrí `/admin/envios` (**Zonas de cobertura y tarifas de envío**).
2. Buscá la fila de **Bogotá**. En la columna **Contra entrega** tiene que decir **No habilitado**.
3. Tocá **Habilitar contra entrega** en esa fila. No pide confirmación: el botón pasa un instante a
   «Habilitando...».
4. Debe pasar: la columna **Contra entrega** de Bogotá cambia a **Habilitado** y arriba aparece el
   aviso **Pago contra entrega habilitado en la zona Bogotá.**

Si en la columna ya dice **Habilitado**, no hay nada que hacer. Si aparece **No pudimos actualizar el
pago contra entrega de la zona. Intentá de nuevo.**, volvé a tocar el botón. Para deshabilitarlo (por
ejemplo, para repetir la demo desde cero) se usa **Deshabilitar contra entrega** en la misma fila, que
sí pide confirmación y avisa lo que implica (ver la sección 6.4 del [manual de
usuario](manual-usuario.md#64-zonas-de-cobertura-y-tarifas-de-envío)).

### 3.5 Datos que dejar listos

**Con el script (3.3) los puntos 1 y 2 ya están cubiertos:** `demo-cliente1@trendy.test` tiene su
dirección principal en Bogotá y el panel de ventas ya tiene ventas registradas y anuladas. Revisá el
punto 3 (el carrito del cliente 1 arranca vacío; el stock de «Camiseta Básica» M Negro queda en 16
porque el pedido pendiente del cliente 2 reservó 2, de sobra para el relato) y el punto 5 (tarifas
reales: Bogotá $8.000).
Los puntos 1 y 2 de abajo son la vía manual.

1. **Dirección del cliente.** Iniciá sesión como `demo-cliente1@trendy.test`, abrí `/direcciones` y
   agregá una dirección **principal** en **Bogotá, Cundinamarca** (Ciudad `Bogotá`, Departamento
   `Cundinamarca`: tiene que coincidir con la zona). Opcional pero útil para un plan B del bloque 6:
   una segunda en **Medellín, Antioquia** (sin contra entrega).
2. **Ventas previas para que los totales no sean cero.** Hacé (o hacelo con anticipación en tres
   minutos) dos compras contra entrega del cliente, confirmá las dos como administrador y **cancelá
   una** como vendedor. Así el panel de ventas ya tiene una «Registrada» y una «Anulada» antes de
   empezar y el bloque 4 tiene qué mostrar.
3. **Carrito del cliente vacío** y **stock suficiente** del producto que vas a comprar (el relato usa
   «Camiseta Básica», talla M, color Negro, 2 unidades). Con el seed hay 18 en esa variante.
4. **Un producto de ejemplo para el error del bloque 5:** no hace falta crear nada; el error se muestra
   en el formulario de «Nuevo producto» sin guardar.
5. **Tarifa de envío:** con un seed limpio la tarifa de Bogotá es **$8.000** y el pedido del relato
   suma **$87.800** (2 × $39.900 + $8.000). En la base de ensayo estaba en $8.500 (total $88.300). Mirá
   el número real en `/admin/envios` y usalo al hablar.

### 3.6 Navegador y ventanas

Trendy ya tiene **Cerrar sesión** (menú de usuario, el ícono de la persona del encabezado), así que con una
sola ventana se puede cambiar de rol. Igual te recomendamos, como **consejo opcional**, **tres ventanas ya
iniciadas**, una por rol: ahorra los cierres e inicios de sesión en vivo y no depende del tiempo de
respuesta de cada login:

| Ventana | Rol | Cómo |
| --- | --- | --- |
| A | Cliente `demo-cliente1@trendy.test` (Laura Camila Rodríguez, Bogotá) | Navegador normal (Chrome) |
| B | Administrador `demo-admin@trendy.test` | Ventana de incógnito de Chrome |
| C | Vendedor `demo-vendedor@trendy.test` | Otro navegador (Edge o Firefox) o otro perfil |

(Las ventanas de incógnito de un mismo navegador suelen compartir el almacenamiento y, con él, la
sesión de Trendy: no uses dos incógnitos.) **La
sesión dura 1 hora**: iniciá sesión en las tres como máximo 30 minutos antes de empezar. En cada ventana
dejá abierta una pestaña por pantalla (son tus atajos; en las ventanas B y C también podés navegar con el
**menú lateral** azul oscuro, a la izquierda, que tiene las pantallas de cada rol; el menú de usuario del
encabezado del administrador y del vendedor tiene solo **Cerrar sesión**):

- A (cliente): `/catalogo`, `/carrito`, `/pedidos`
- B (admin): `/admin`, `/admin/pedidos`, `/admin/ventas`, `/admin/envios`
- C (vendedor): `/vendedor`, `/vendedor/pedidos`, `/vendedor/ventas`, `/vendedor/productos`, `/vendedor/inventario`

Tamaño: pantalla de escritorio, 1280 × 720 o más, zoom al 100 % (con menos de 900 px de ancho el menú
lateral se pliega en un botón: **Menú de administración** o **Menú del vendedor**). Cerrá notificaciones y otras pestañas.
Acordate de que tras iniciar sesión el sistema te deja según el rol: el cliente en `/` (la página de
inicio, que solo lleva al catálogo), el administrador en `/admin` y el vendedor en `/vendedor` (sus
paneles de inicio, con datos reales). Así, las ventanas B y C quedan en la primera pestaña de su lista;
en la A, andá a las pestañas preparadas.

### 3.7 Checklist final (marcar antes de empezar)

- [ ] `http://localhost:3000/api/v1/health` responde `ok` y `http://localhost:5173/catalogo` carga.
- [ ] Mercado Pago **sin** configurar (para el bloque 6): `MERCADOPAGO_ACCESS_TOKEN` vacía o ausente en
  `backend/.env` y no exportada en la terminal (verificación de 3.2).
- [ ] Datos de demo cargados (`node scripts/datos-demo.js`, 3.3) y tres ventanas iniciadas (A, B, C).
- [ ] Bogotá con contra entrega habilitado; cliente con dirección principal en Bogotá.
- [ ] Carrito del cliente vacío; panel de ventas con al menos una venta registrada y una anulada.
- [ ] Una pestaña por pantalla preparada en cada ventana.
- [ ] Este guion abierto en otra pantalla o impreso.

---

## 4. El relato

### Bloque 0. Apertura (1:00)

| | |
| --- | --- |
| **Qué hago** | Ventana A en `/catalogo`, sin tocar nada. |
| **Qué digo** | «Trendy es una tienda de ropa en línea: catálogo público, carrito, pedidos, pago contra entrega o con Mercado Pago, seguimiento del envío y registro de ventas, con paneles para vendedores y administradores. Les voy a mostrar el ciclo completo de una venta con tres personas: una clienta, una administradora y un vendedor. Y al final, con franqueza, qué está probado y qué no.» |
| **Qué debe pasar** | Se ve **Catálogo de productos**, «Encontrá las últimas tendencias para vos.» y «20 productos» (con el seed limpio; o la cantidad de tu base). |
| **Plan B** | Si no carga: revisá que el backend esté en `:3000` y `VITE_API_URL` en `frontend/.env.local`; reiniciá `npm run dev`. |

### Bloque 1. El cliente compra con pago contra entrega (3:30)

| Paso | Qué hago | Qué digo | Qué debe pasar | Plan B |
| --- | --- | --- | --- | --- |
| 1.1 | En el catálogo escribo `camiseta` en **Buscar**, elijo la categoría «Camisetas» y toco **Limpiar filtros**. | «Búsqueda y filtros combinables: texto, categoría, talla y rango de precio.» | La lista se reduce al escribir y vuelve a mostrar todo con **Limpiar filtros**. | Si no filtra, recargá la página. |
| 1.2 | Toco **Ver producto** en «Camiseta Básica». | «Cada talla y color tiene su propio stock; lo agotado se deshabilita.» | Se ve el detalle con **Talla y color** (L · Negro, M · Negro, S · Negro). | Entrá por `/productos/3` (en el seed, «Camiseta Básica» es el 3). |
| 1.3 | Elijo **M · Negro**, toco **+** una vez (cantidad 2) y **Agregar al carrito**. | «Muestra el stock disponible y no deja pasarse.» | **Stock disponible: N**; después **Agregaste el producto a tu carrito.** con el enlace **Ver carrito**; el contador del carrito pasa a 1. | Si aparece el login, la sesión venció: iniciá sesión de nuevo. |
| 1.4 | Toco **Ver carrito**. En **Resumen de compra**, elijo la dirección de Bogotá. | «El envío se calcula según la zona de cobertura de la dirección.» | Se ve **Subtotal $79.800**, **Envío** con la tarifa y **Total**. **Continuar compra** se habilita. | Si sale «No tenemos cobertura de envío para...», la dirección no coincide con la zona: cargá una en Bogotá, Cundinamarca. |
| 1.5 | Toco **Continuar compra**. En **Método de pago** elijo **Pago contra entrega** y toco **Confirmar pedido**. | «Contra entrega solo está disponible en las zonas que el administrador habilita. El precio de cada producto queda fijo al confirmar.» | Pasa al detalle del pedido con **¡Gracias por tu compra! Tu pedido PED-... quedó registrado. Pagás al recibirlo.**, estado **Pendiente de pago**, pago «Pendiente» y «Pagás $ ... al recibir tu pedido.» | Si dice **El pago contra entrega no está disponible en la zona de tu dirección...**, falta el paso 3.4. El pedido no se creó; habilitalo y repetí. |
| 1.6 | Muestro **Seguimiento del envío** y la tabla de productos. | «El stock ya se descontó: se reserva al crear el pedido. El cliente ve los cuatro pasos del envío.» | Los cuatro pasos aparecen pendientes con «El envío empieza cuando tu pedido esté confirmado y en preparación.» | |

**Anotá el número de pedido** (`PED-` y muchos dígitos): lo vas a buscar en el bloque 2.

### Bloque 2. La tienda confirma y nace la venta (2:00)

| Paso | Qué hago | Qué digo | Qué debe pasar | Plan B |
| --- | --- | --- | --- | --- |
| 2.1 | Ventana B, `/admin/pedidos`. Primera fila = el pedido nuevo. Toco **Ver**. | «Esta es la gestión de pedidos. El pedido llega pendiente, con el pago contra entrega registrado.» | Detalle con Cliente, **Método de pago: Pago contra entrega**, **Pago: Pendiente**, **Envío: Todavía no empezó** y el panel **Acciones**. | Si no está, tocá **Actualizar** o filtrá por **Número de pedido**. |
| 2.2 | Toco **Pasar a «Confirmado»** y **Sí, cambiar estado**. | «Los estados avanzan de a un paso, sin saltos ni retrocesos. Un contra entrega se puede confirmar a mano; uno de Mercado Pago lo confirma solo el pago.» | Aviso **Pedido PED-...: ahora está «Confirmado».** | Si el botón no está, falta el pago contra entrega del cliente: mirá la nota del panel. |
| 2.3 | En el menú lateral de la izquierda toco **Ventas** (o la pestaña `/admin/ventas`). | «Acá nace la venta: no cuando se paga, sino cuando el pedido se confirma.» | Una fila nueva **Registrada** con el total, y la tarjeta **Ventas registradas** suma. | Tocá **Actualizar**. |
| 2.4 | Toco **Ver detalle** de esa venta. | «Los precios son los del momento de la compra. El Responsable es quien la registró: Administrador Demo.» | Ventana **Venta #N — pedido PED-...** con **Estado de la venta: Registrada**, **Responsable: Administrador Demo**, productos y totales. Cerrá con **Cerrar**. | |

### Bloque 3. Cancelación por un vendedor y «Anulada por» (2:30)

| Paso | Qué hago | Qué digo | Qué debe pasar | Plan B |
| --- | --- | --- | --- | --- |
| 3.1 | Ventana C, `/vendedor/pedidos`. Filtro por **Número de pedido** (pego el `PED-...`), **Filtrar**, **Ver**. | «El vendedor ve los mismos pedidos que el administrador: en esta versión no hay pedidos asignados.» | El pedido en estado **Confirmado**. | Si la lista no lo muestra, **Limpiar filtros**. |
| 3.2 | Toco **Pasar a «En preparación»** y **Sí, cambiar estado**; después **Marcar envío como «Enviado»** y **Sí, actualizar envío**. | «Con el envío, el estado del pedido avanza junto.» | Pedido **Enviado** y en la fila **Envío**: «Enviado (actualizado ...)». | Para ganar tiempo, saltá este paso y cancelá desde «Confirmado»: **cambian los textos de 3.3, 3.4 y 3.6** (ver la nota debajo de la tabla). |
| 3.3 | Toco **Cancelar pedido** y **leo en voz alta** la ventana de confirmación. | «Si el cliente rechaza el pedido en la puerta, la tienda lo puede cancelar. Fíjense lo que avisa el sistema: repone las unidades al stock, advierte que, como ya salió, hay que confirmar que la mercadería vuelve, y que la venta se anula.» | «¿Cancelar el pedido PED-...? Las 2 unidades reservadas vuelven al stock... Como el pedido ya salió de la tienda... La venta registrada de este pedido se anula. El pago contra entrega registrado también se cancela. Esta acción no se puede deshacer.» | |
| 3.4 | Toco **Sí, cancelar pedido**. | «No se borra nada: la venta queda anulada.» | Aviso **Pedido PED-... cancelado. El stock se repuso en el sistema, pero la mercadería puede no haber vuelto todavía. La venta quedó anulada.** y «No hay acciones disponibles para un pedido «Cancelado».» | |
| 3.5 | Toco **Ventas** y **Ver detalle** de la venta. | «La venta anulada conserva todo y registra **quién** la anuló: Vendedor Demo. El responsable que la registró sigue siendo el administrador.» | **Estado de la venta: Anulada**, **Fecha de anulación**, **Anulada por: Vendedor Demo**, **Responsable: Administrador Demo**. La tarjeta **Ventas anuladas** suma el importe. | |
| 3.6 | (Opcional, 20 s) Ventana A, `/pedidos`, abro el pedido. | «El cliente lo ve cancelado.» | Estado **Cancelado** y «El pedido ya había salido de la tienda cuando se canceló. Comunicate con la tienda para coordinar la devolución.» | |

**Nota: si salteás el paso 3.2 y cancelás desde «Confirmado»** (plan B de tiempo; los textos de este
camino se tomaron del código, no se vieron en pantalla), lo que está escrito en 3.3, 3.4 y 3.6 **no**
coincide, porque el pedido nunca salió de la tienda:

- **3.3 (ventana de confirmación):** no aparece el aviso «Como el pedido ya salió de la tienda...» (solo
  sale desde «Enviado» o «En tránsito»). Leé: «¿Cancelar el pedido PED-...? Las 2 unidades reservadas
  vuelven al stock y quedan disponibles para la venta. La venta registrada de este pedido se anula. El
  pago contra entrega registrado también se cancela. Esta acción no se puede deshacer.» Y no digas lo de
  «como ya salió».
- **3.4 (aviso de éxito):** **Pedido PED-... cancelado. Su stock volvió a estar disponible. La venta
  quedó anulada.** (sin la frase de «la mercadería puede no haber vuelto todavía»).
- **3.6 (vista del cliente):** **Este pedido se canceló antes de salir de la tienda.** (sin el texto de
  coordinar la devolución).
- **3.5 y el bloque 4** no cambian: la venta queda «Anulada» y «Anulada por: Vendedor Demo» igual.

### Bloque 4. Panel de ventas: filtros y totales (1:30)

| Paso | Qué hago | Qué digo | Qué debe pasar | Plan B |
| --- | --- | --- | --- | --- |
| 4.1 | En `/vendedor/ventas` señalo las dos tarjetas. | «Dos totales: ventas registradas y ventas anuladas, con importe y cantidad. Son del período elegido, no solo de la página.» | **Ventas registradas** y **Ventas anuladas** con importes y «N ventas». | Si todo está en cero, faltan los datos previos (3.5). |
| 4.2 | Elijo **Estado: Anulada** y **Filtrar**. | «El filtro de estado cambia la tabla, pero las tarjetas siguen mostrando todo el período; es a propósito.» | Solo se ven las anuladas; las tarjetas **no cambian**. | |
| 4.3 | **Limpiar filtros**. Pongo **Desde** posterior a **Hasta** y **Filtrar**. | «Las fechas son en hora de Bogotá, y valida rangos imposibles.» | **La fecha «desde» no puede ser posterior a «hasta».** y no se consulta nada. | |
| 4.4 | **Limpiar filtros**. | | Vuelve la lista completa con «Ventas encontradas: N». | |

### Bloque 5. Un error legible: precio con centavos (1:00)

| Paso | Qué hago | Qué digo | Qué debe pasar | Plan B |
| --- | --- | --- | --- | --- |
| 5.1 | Ventana C, `/vendedor/productos`, **Nuevo producto**. Nombre `Prueba`, categoría «Mujer», **Precio** `12500.50`, **Guardar**. | «Los montos son pesos enteros, sin centavos: según fuentes no oficiales, Mercado Pago no acepta centavos en pesos colombianos (no lo pudimos confirmar en su sandbox), así que lo prevenimos desde la carga. Miren cómo responde el sistema.» | **El precio debe ser un valor entero en pesos (COP), sin centavos.** Nada se guarda. | |
| 5.2 | Cambio el precio a `100000000` y **Guardar**. | «Y hay un tope.» | **El precio no puede superar 99999999 (COP).** | |
| 5.3 | Cierro la ventana con **Cancelar** (no guardo nada). | | | |

**Alternativa de error (+1 minuto, con las tres ventanas):** el cliente deja 3 unidades de un producto en
el carrito; el vendedor registra una **Salida** que deje solo 1 en `/vendedor/inventario`; al recargar
`/carrito` se ve **Solo quedan 1 unidades disponibles. Ajustá la cantidad.** y **Continuar compra**
queda bloqueado con «Ajustá las cantidades sin stock para continuar.»

### Bloque 6. Mercado Pago: el aviso previsto y lo que falta (1:00)

Este bloque **no muestra un pago real**: muestra el comportamiento previsto cuando Mercado Pago no está
disponible. Decilo antes de empezar.

| Paso | Qué hago | Qué digo | Qué debe pasar | Plan B |
| --- | --- | --- | --- | --- |
| 6.1 | Ventana A: agrego 1 producto, voy a **Continuar compra**, dejo **Mercado Pago** y **Confirmar pedido**. | «Importante: Mercado Pago real nunca se probó. El sistema está probado con una simulación porque el aviso de pago necesita una dirección pública y el entorno es local. Lo que sí se probó es qué hace Trendy cuando la pasarela no responde.» | Llega al detalle con **Tu pedido PED-... quedó registrado, pero no pudimos iniciar el pago. El pago online no está disponible por ahora. Probá de nuevo más tarde; en tus próximas compras también podés elegir pago contra entrega. Podés reintentarlo desde acá.** y el botón **Pagar con Mercado Pago**. | Si en cambio se abre Mercado Pago, hay credenciales configuradas: volvé a la verificación previa de 3.2, vaciá `MERCADOPAGO_ACCESS_TOKEN` en `backend/.env` y reiniciá el backend. |
| 6.2 | Hablo con la pantalla a la vista. | «El pedido existe y el stock está reservado. Si nadie paga, el administrador lo cancela con "Cancelar pedidos vencidos" pasadas 24 horas.» | | Luego, como administrador, cancelá ese pedido (**Cancelar pedido**) para devolver el stock. |

### Bloque 7. Cierre (1:00)

Texto sugerido (leelo con tus palabras):

> «Vimos el ciclo completo: una clienta compra con contra entrega, la tienda confirma y nace la venta,
> un vendedor cancela y queda registrado quién anuló y por qué hay stock repuesto, y los totales se
> consultan por período. Lo construimos con una API por capas y 807 pruebas automáticas del backend
> que corrimos dos veces sobre el código integrado, con revisiones independientes en cada pull request
> de código —que encontraron errores reales y se corrigieron— y TDD en las partes críticas. Les
> decimos con la misma claridad lo que falta: Mercado Pago real nunca se probó, no hay un servidor
> público, el frontend no tiene pruebas automáticas y varias pantallas necesitan pulido, como un menú.
> Lo dejamos documentado para que quien siga sepa exactamente dónde está parado. Gracias.»

---

## 5. Qué NO mostrar, o cómo manejarlo

- **Mercado Pago real:** nunca se probó. No intentes pagar de verdad ni prometas que funciona. Mostrá solo
  el aviso previsto (bloque 6) y decilo.
- **Contraseñas y `.env`:** no abras archivos `.env` ni el script con la clave a la vista.
- **Defectos menores conocidos** (`docs/bitacora/sprint-5-revision-retrospectiva.md`, puntos 12 a 16
  de «Deuda y puntos abiertos»):
  - *Punto 12:* «Envío: Todavía no empezó» en un pedido recién confirmado, y el botón **Registrar cobro
    contra entrega** que sigue visible en un pedido ya **Entregado** si el cobro nunca se registró.
    **Cómo evitarlo:** no abras pedidos entregados y no te detengas en el campo Envío de un pedido
    recién confirmado; si preguntan, es un texto engañoso conocido (manda el estado del pedido).
  - *Punto 13:* el formato de moneda no es uniforme (`$39.900` vs `$ 39.900`). No lo comentes.
  - *Punto 14:* el seguimiento del cliente no dibuja el historial. Los tableros de inicio del personal
    (`/admin` y `/vendedor`, con la entrada **Panel de inicio** en el menú lateral) ya muestran datos reales
    (ventas, pedidos por estado, inventario, gráfico de 30 días), pero son más simples que los de los
    mapas de pantalla (sin porcentajes ni selector de período; ver «Límites conocidos» del manual).
    **Cómo evitarlo:** usá las pestañas preparadas (3.6); si preguntan por el historial, la API ya lo
    devuelve y falta dibujarlo.
  - *Punto 15:* accesibilidad de los componentes comunes. No uses teclado ni lector de pantalla en la
    demo.
  - *Punto 16:* `GET /ventas` se pide dos veces por carga en desarrollo (modo estricto de React); no
    ocurre en producción. Si alguien abre las herramientas del navegador, explicalo así.
- **Otros detalles que encontró el ensayo** (no están en la bitácora; conviene conocerlos):
  - La página de inicio (`/`) es una portada: banner, tres beneficios, categorías y una muestra de 4
    productos. No es un panel: no tiene accesos a pedidos ni a la gestión. Las categorías abren el
    catálogo **sin filtrar**, y «una muestra» son los primeros 4 productos de la lista, no «los más
    nuevos». Después de iniciar sesión solo el cliente llega ahí (el administrador y el vendedor entran
    a su panel de inicio): pasá directo a las pestañas preparadas.
  - Ya hay **Cerrar sesión** en el menú de usuario (ícono de persona del encabezado): las tres ventanas
    son un consejo opcional, no una obligación. La lupa del encabezado y el corazón y el carrito de las
    tarjetas del catálogo no hacen nada: no los toques.
  - En «Roles y permisos» no hay permisos cargados y la pantalla no hace nada útil: no la abras.
  - Recuperar la contraseña **no envía correo**: el enlace sale por la consola del backend. Si querés
    mostrarla, tené la consola a mano y decí que no hay servicio de correo (diferido a la versión 2.0).
  - Un producto sin stock **desaparece del catálogo** (la lista solo muestra productos con alguna
    variante disponible). Si dejás una variante en 0 antes de la demo, no la vas a ver en la lista.
  - En el historial de inventario, la reposición por cancelación aparece a nombre del cliente, no de
    quien canceló.

## 6. Si algo se rompe en vivo

| Síntoma | Qué hacer |
| --- | --- |
| Pantalla en blanco o «No pudimos cargar...» | Revisá la terminal del backend; reiniciá `npm run dev`. Tras reiniciar MySQL, el backend puede tardar varios minutos en recuperar la conexión (observado): reiniciá el backend. |
| Te mandó a **Iniciar sesión** de golpe | La sesión venció (1 hora). Iniciá sesión de nuevo. La clave de las cuentas cargadas con `scripts/datos-demo.js` es la de `DATOS_DEMO_PASSWORD` (si la definiste; tenela en tu gestor) o, si no, la constante `PASSWORD_DEMO` del propio script (está en el repositorio). Las cuentas creadas a mano con `crear-usuario.js` usan la que elegiste. |
| El botón de la acción no aparece | El estado del pedido no es el esperado. Mirá la etiqueta de estado y la nota del panel **Acciones**. |
| Se perdieron los datos de la demo | Con una base nueva, `node scripts/datos-demo.js` los rehace en segundos (3.3; sobre la misma base aborta a propósito). O rehacelos a mano en 5 minutos (3.4 y 3.5) o contá el relato mostrando las pantallas ya preparadas. |
| Todo falla | Tené un recorrido grabado como último recurso (un video del ensayo, que el equipo puede grabar con el entorno funcionando). |

## 7. Preguntas probables del jurado y respuestas honestas

Cada respuesta se apoya en algo comprobable en el repositorio (entre paréntesis, dónde).

**1. ¿Cuántas pruebas tienen y qué cubren?**
807 pruebas automáticas del backend (798 + 9 del flujo de punta a punta), corridas dos veces sobre una
base descartable (bitácora del Sprint 5). Cubren reglas de negocio, concurrencia y contratos
HTTP. **El frontend no tiene pruebas automáticas**: se valida con `npm run lint` y revisión manual en
navegador (README).

**2. ¿Probaron Mercado Pago?**
No contra Mercado Pago real. Está implementado y probado con la librería simulada: la firma del aviso, la
idempotencia y los montos. El flujo real necesita una URL pública y credenciales de prueba que no tuvimos.
Es la excepción abierta más importante y no se debe usar dinero real hasta cerrarla (bitácora del
Sprint 4 y del Sprint 5, «Deuda» punto 1).

**3. ¿Qué pasa si dos clientes compran la última unidad?**
El pedido toma un bloqueo sobre el carrito y el stock se descuenta dentro de la misma transacción: el
segundo recibe un error de stock y no se crea el pedido. Hay pruebas automáticas para eso: dos clientes
que compiten por la última unidad (gana uno, stock final 0) y 10 pedidos simultáneos sobre un stock de 5
(5 aceptados, 5 rechazados) en `backend/tests/pedido.crear.http.test.js` e
`inventario.descuento.test.js`. **No se probó con varias instancias del servidor ni con carga
sostenida** (bitácora del Sprint 5, «No verificado»).

**4. ¿Por qué el stock se descuenta al crear el pedido y no al pagar?**
Es una reserva: así nadie compra lo que ya está apartado. Se repone al cancelar o vencer. Se aparta del
diseño original (DDS §7.2, descuento al aprobar el pago) y está documentado como decisión
(docs/diseno/pedidos-estados.md, §9). El costo: un pedido de Mercado Pago sin pagar retiene stock hasta que
el administrador cancele los vencidos, porque no hay un proceso automático.

**5. ¿Por qué el cliente no puede cancelar su pedido?**
El requisito RF-033 se difirió a la versión 2.0 (ERS §2.8.3) y la regla RN-010 exige que el negocio defina
primero la política de cancelaciones. Hoy cancela el personal, a pedido del cliente.

**6. ¿Cómo evitan duplicados al pagar o confirmar?**
Hay una sola venta por pedido (restricción única en la base), el registro es idempotente ante avisos
repetidos o simultáneos, y el checkout bloquea el doble clic: en el Sprint 4 se probó un triple clic en
«Confirmar pedido» y se creó un solo pedido y un solo pago.

**7. ¿Cómo sé quién anuló una venta?**
La venta guarda quién la **registró** (Responsable) y quién la **anuló** (Anulada por). Las ventas anuladas
antes de agregar ese dato figuran como «No registrado». Los reembolsos de Mercado Pago están fuera de
alcance (docs/diseno/pedidos-estados.md, §6).

**8. ¿Hicieron revisiones de código?**
Cada pull request de código, salvo tres, pasó por una revisión independiente en contexto fresco que
encontró problemas reales —por ejemplo, que la preferencia de Mercado Pago no incluía el costo de envío,
una foto vieja dentro de una transacción o fechas extremas que terminaban en un error 500— y se corrigieron
antes de integrar. Los que **no** la tuvieron están declarados: #41, #43 y #44 (cambios chicos o solo un
test); el #35 solo integra ramas sin código nuevo (bitácora del Sprint 5; hallazgos en las del Sprint 4
y 5).

**9. ¿Usaron TDD?**
En las partes críticas de pagos, pedidos y ventas se trabajó con pruebas primero y pruebas de mutación:
romper a propósito un bloqueo o la reposición de stock hace fallar los tests (bitácoras del Sprint 4 y 5).
No es el caso del frontend.

**10. ¿Qué tan segura es?**
Las contraseñas se guardan con bcrypt (costo 12), las sesiones son JWT de 1 hora y las rutas protegidas validan el rol que viene en el token (hay rutas
públicas, como el catálogo). Un límite que hay que decir: el sistema no vuelve a consultar al usuario en la base en cada
petición, así que si se desactiva una cuenta, la sesión ya abierta sigue funcionando hasta que el token vence (1 hora).
Lo pendiente está declarado: CORS abierto, sin límite de intentos en el login, sin HTTPS en el staging local
y un manejador de errores que puede devolver texto interno en un error 5xx (deuda punto 4; docs/despliegue/staging.md,
«Limitaciones»).

**11. ¿Cómo se despliega?**
Hay un staging local con Docker Compose (nginx, backend y MySQL) y una prueba de humo de 29 comprobaciones
que pasó, también desde cero (docs/despliegue/staging.md). **No hay un servidor real**, ni HTTPS ni
respaldos automáticos.

**12. ¿Cómo se navega?**
El administrador y el vendedor navegan con un menú lateral fijo a la izquierda, con las pantallas que
existen hoy para su rol (en el celular se despliega con un botón); su menú de usuario del encabezado
(ícono de la persona) tiene solo **Cerrar sesión**. El cliente usa ese menú de usuario: **Mis pedidos**,
**Mis direcciones**, **Mi carrito**, **Catálogo** y **Cerrar sesión**. Al iniciar sesión, el administrador
y el vendedor llegan a su panel de inicio con datos reales (ventas, pedidos por estado, inventario,
gráfico de 30 días), y la primera entrada del menú lateral, **Panel de inicio**, vuelve a él. La página de inicio (`/`) es una portada simple
(banner, categorías y una muestra del catálogo): no es un panel.

**13. ¿Por qué precios enteros, sin centavos?**
Para evitar que la pasarela rechace un pago. Ojo: es una regla de **prevención** basada en fuentes no
oficiales; **no pudimos confirmarla contra Mercado Pago real** y quedó pendiente de comprobar en el
sandbox (docs/diseno/montos-cop.md).

**14. ¿Qué decisiones de producto tomaron?**
Que un contra entrega se puede cancelar mientras no se haya entregado ni cobrado (y entonces se anula su
venta y se repone el stock); que Mercado Pago ya pagado no se cancela por esa vía; que admin y vendedor
ven todas las ventas. Algunas (reponer stock desde «Enviado», quién cancela) se tomaron en el desarrollo
y quedan a confirmar con el dueño del negocio (bitácora del Sprint 5, «Deuda» puntos 2 y 3).

**15. ¿Quién hizo el trabajo?**
De los 70 commits propios del Sprint 5, 66 son de Oscar Pérez, 3 de Valentina Ortiz y 1 de Valentina
Linares; el Sprint 5 se implementó con asistencia de IA para llegar al 31/10 (bitácora del Sprint 5,
«Qué no funcionó»). **Acordá con el equipo antes de la entrega cómo se presenta esa autoría**; la
bitácora ya lo marca como pendiente.

**16. ¿Qué falta para usarla con clientes reales?**
Probar Mercado Pago en el sandbox, un servidor con HTTPS y dominio, secretos gestionados, respaldos, un
proceso que cancele pedidos vencidos y definir con el negocio la política de cancelaciones y de
reembolsos (docs/despliegue/staging.md, «Qué falta para un despliegue real»).

**17. ¿Cómo decide la tienda dónde se puede pagar contra entrega?** *(extra opcional; no está cronometrado
y no cuenta en los 13:30)*
El administrador lo habilita zona por zona en `/admin/envios` (ventana B, pestaña ya preparada): la
columna **Contra entrega** muestra **Habilitado** / **No habilitado** y cada fila tiene el botón
**Habilitar contra entrega** o **Deshabilitar contra entrega**. Si lo deshabilita, el sistema pide
confirmación y avisa que los pedidos contra entrega de esa zona que todavía no registraron su pago
quedan pendientes, reteniendo su stock, hasta que el personal los cancele a mano. **No deshabilites
Bogotá en vivo**: rompería el resto de la demo; si querés mostrarlo, abrí la confirmación y cerrala con
**Cancelar**.

## 8. Cómo se ensayó

El 18/10/2026 se recorrió el relato completo en la aplicación real (backend y frontend en desarrollo,
base descartable con el seed) con un cliente, un administrador y un vendedor creados para la demo: el
contra entrega con aviso, la confirmación y la venta, la cancelación con «Anulada por», los filtros y
totales, los errores de precio y de stock y el aviso de Mercado Pago. Las pantallas cargaron en torno a
un segundo. Los tiempos de la sección 2 son **estimados** a ritmo de presentación (cantidad de clics y
de texto a decir), no medidos con una persona presentando: ensayalo una vez con cronómetro. Lo que **no**
se ensayó: la opción B (staging con Docker), el paso 3.4 dentro del flujo completo del guion (el botón
**Habilitar contra entrega** de `/admin/envios`, con su columna y su aviso, se verificó en el navegador
al integrarlo en el PR #48, pero no se recorrió como parte de este ensayo completo), el plan B de
cancelar desde «Confirmado» sin pasar por «Enviado» (los textos de ese camino se tomaron del código,
no de la pantalla), otros navegadores que no sean Chromium y pantallas de celular.
