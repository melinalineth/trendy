# Manual de usuario de Trendy

Trendy es una tienda de ropa en línea: tiene un catálogo público, carrito, pedidos, pago contra
entrega o con Mercado Pago, seguimiento del envío y registro de ventas. Este manual explica, pantalla
por pantalla, qué podés hacer según tu rol. Los nombres de botones, etiquetas y mensajes están
copiados de la aplicación tal como se ve hoy (versión 1.0, octubre de 2026).

Todo lo que dice este manual fue comprobado en la aplicación corriendo. Lo que no se pudo comprobar
figura en [Por verificar](#por-verificar) y lo que todavía no funciona o es incómodo, en
[Límites conocidos](#límites-conocidos). Si algo de tu pantalla no coincide con este texto, la
pantalla manda: avisale al equipo.

## Índice

1. [Quién hace qué](#1-quién-hace-qué)
2. [Antes de empezar: cómo moverte](#2-antes-de-empezar-cómo-moverte)
3. [Ingresar a Trendy](#3-ingresar-a-trendy)
4. [Cliente](#4-cliente)
5. [Vendedor](#5-vendedor)
6. [Administrador](#6-administrador)
7. [Glosario de estados](#7-glosario-de-estados)
8. [Reglas importantes, explicadas simple](#8-reglas-importantes-explicadas-simple)
9. [Problemas frecuentes](#9-problemas-frecuentes)
10. [Límites conocidos](#límites-conocidos)
11. [Por verificar](#por-verificar)

---

## 1. Quién hace qué

| Rol | Cómo se obtiene | Qué puede hacer |
| --- | --- | --- |
| **Visitante** (sin sesión) | Entrando al sitio | Ver el catálogo y el detalle de cada producto, registrarse, iniciar sesión y recuperar la contraseña. |
| **Cliente** | Registrándose en la pantalla «Crear cuenta» | Todo lo del visitante, más: guardar direcciones, usar el carrito, comprar (checkout), ver sus pedidos y el seguimiento del envío. |
| **Vendedor** | Lo crea el equipo técnico (ver el [README](../../README.md#cómo-crear-un-vendedor-o-un-administrador)) | Gestionar productos, inventario y pedidos (estados, envío, cobro contra entrega, cancelaciones) y consultar las ventas. Ve **todos** los pedidos y **todas** las ventas, no solo «los suyos». |
| **Administrador** | Lo crea el equipo técnico | Todo lo del vendedor, más: zonas de cobertura y tarifas de envío, cancelar pedidos vencidos y ver/activar/desactivar usuarios y vendedores. |

Un cliente no puede cancelar un pedido por su cuenta: la cancelación la hace el personal (vendedor o
administrador), a pedido del cliente.

## 2. Antes de empezar: cómo moverte

**Trendy todavía no tiene un menú de navegación.** El encabezado es el mismo en todas las pantallas y
solo trae lo siguiente:

- El título **Trendy** y una barra **Buscar productos...** con una
  lupa. Esa barra del encabezado **no filtra nada**: para buscar usá el catálogo (ver
  [4.2](#42-catálogo-buscar-y-filtrar)).
- Un botón con el ícono de una persona que **no hace nada** por ahora.
- **Mis pedidos**: solo aparece si iniciaste sesión como cliente.
- **Ventas**: solo aparece si iniciaste sesión como vendedor o administrador.
- El ícono del carrito, con un número: es la cantidad de productos **distintos** que tenés en el
  carrito (dos camisetas iguales cuentan 1). Solo lo ven los visitantes y los clientes.

El resto de las pantallas se abre **escribiendo la dirección en la barra del navegador**, a
continuación de la dirección del sitio:

| Para ir a... | Escribí | Quién |
| --- | --- | --- |
| Página de inicio | `/` | Todos |
| Iniciar sesión | `/login` | Todos |
| Crear una cuenta | `/registro` | Todos |
| Recuperar la contraseña | `/recuperar-password` | Todos |
| Catálogo | `/catalogo` | Todos |
| Mi carrito | `/carrito` | Cliente |
| Mis direcciones | `/direcciones` | Cliente |
| Finalizar compra | `/checkout` | Cliente |
| Mis pedidos | `/pedidos` (o el enlace **Mis pedidos**) | Cliente |
| Panel de inicio del personal | `/vendedor` (vendedor) o `/admin` (administrador); es donde llegás al iniciar sesión | Vendedor / Administrador |
| Productos | `/vendedor/productos` (vendedor) o `/admin/productos` (administrador) | Vendedor / Administrador |
| Inventario | `/vendedor/inventario` (vendedor) o `/admin/inventario` (administrador) | Vendedor / Administrador |
| Gestión de pedidos | `/vendedor/pedidos` (vendedor) o `/admin/pedidos` (administrador) | Vendedor / Administrador |
| Ventas | `/vendedor/ventas` (vendedor) o `/admin/ventas` (administrador), o el enlace **Ventas** | Vendedor / Administrador |
| Vendedores | `/admin/vendedores` | Administrador |
| Usuarios | `/admin/usuarios` | Administrador |
| Roles y permisos | `/admin/roles` | Administrador |
| Zonas de cobertura y tarifas de envío | `/admin/envios` | Administrador |

Las direcciones que empiezan con `/vendedor/` son solo para el vendedor y las que empiezan con
`/admin/` solo para el administrador: **el administrador no entra a `/vendedor/...` ni el vendedor a
`/admin/...`**, cada uno usa las de su rol. Si entrás a una pantalla que no es de tu rol, te devuelve a
la página de inicio sin ningún aviso. Si
entrás a una pantalla de cliente o de personal sin haber iniciado sesión, te lleva a **Iniciar
sesión**.

Si escribís una dirección que no existe (por ejemplo `/algo` o `/productos`, sin número), Trendy muestra
la pantalla **No encontramos esta página** debajo del encabezado, con dos botones: **Ir al inicio** y
**Ver el catálogo**. Esa pantalla sale igual con o sin sesión iniciada.

**La página de inicio (`/`)** es la portada de la tienda y la ven todos, hayan iniciado sesión o no.
Si sos cliente, después de iniciar sesión llegás ahí; el vendedor y el administrador llegan a su
propio panel de inicio (ver [5.0](#50-panel-de-inicio-vendedor) y [6.0](#60-panel-de-inicio-admin)).
La portada muestra, de arriba abajo:

- Un banner con **NUEVA COLECCIÓN**, «Descubrí tu estilo» y el botón **Comprar ahora**, que abre el
  catálogo. En pantallas anchas lo acompañan hasta 3 fotos de productos.
- Tres beneficios: **Envío a domicilio** («En las ciudades con cobertura»), **Pago contra entrega**
  («Disponible en las zonas habilitadas») y **Moda actual** («Prendas para todos los días»). El envío
  y el contra entrega solo existen en las zonas de cobertura que el administrador habilitó.
- **Categorías**: círculos con las categorías que tienen al menos un producto a la venta. Tocar
  cualquiera abre el catálogo **sin elegir esa categoría**: el filtro se elige ahí (ver
  [4.2](#42-catálogo-buscar-y-filtrar)).
- **Una muestra del catálogo**: los primeros 4 productos de la lista, que viene ordenada por número de
  producto (son los primeros cargados, no «los más nuevos»: el sistema no guarda la fecha de alta), con el botón **Ver producto**, y el enlace **Ver todo el
  catálogo**. El corazón y el ícono de carrito de esas tarjetas no hacen nada, igual que en el catálogo.

Si no hay productos a la venta, el banner y los beneficios se ven igual y en las otras dos secciones
aparece un aviso en cada una: «Todavía no hay categorías con productos. ¡Volvé pronto!» en
**Categorías** y «Todavía no hay productos a la venta. ¡Volvé pronto!» en la muestra. Si el servidor no responde, aparece **No
pudimos cargar los productos. Intentá de nuevo más tarde.** (no hay botón para reintentar: recargá la
página).

**No hay botón para cerrar sesión.** La sesión dura 1 hora (valor por defecto del servidor) y se cierra
sola al vencer: la próxima petición te manda a iniciar sesión de nuevo. Si necesitás entrar con otra
cuenta antes, abrí una **ventana privada** del navegador o borrá los datos del sitio.

Recomendación: usá una pantalla de escritorio (1280 píxeles de ancho o más).

## 3. Ingresar a Trendy

### 3.1 Crear una cuenta (`/registro`)

Pantalla **Crear cuenta**. Completá:

- **Nombre**
- **Correo electrónico** (con formato de correo)
- **Contraseña** (mínimo 8 caracteres)
- La casilla **Acepto las políticas de privacidad y los términos de uso**. El botón **Crear cuenta**
  queda deshabilitado hasta que la marques.

Qué puede pasar:

- Todo bien: aparece **Cuenta creada con éxito. Te llevamos al login...** y a los pocos segundos
  pasás solo a **Iniciar sesión**. La cuenta nace con rol cliente.
- El correo ya existe: **Ese correo ya está registrado.**
- Un correo sin arroba («@»): lo frena el propio navegador con su aviso nativo, antes de enviar nada
  al servidor (lo mismo pasa en **Iniciar sesión** y en **Recuperar contraseña**).
- Cualquier otro problema (por ejemplo una contraseña de menos de 8 caracteres o un correo que el
  navegador acepta pero el sistema no): **No pudimos completar el registro. Revisá los datos e
  intentá de nuevo.** El mensaje no dice cuál es el campo con el problema; revisá los tres.

### 3.2 Iniciar sesión (`/login`)

Pantalla **Iniciar sesión**: **Correo electrónico**, **Contraseña** y el botón **Ingresar** (mientras
trabaja dice «Ingresando...»). Debajo hay dos enlaces: **¿Olvidaste tu contraseña?** y **Crear una
cuenta**.

- Si los datos no coinciden aparece **Correo o contraseña incorrectos.** Es el mismo mensaje si el
  correo no existe, si la contraseña es incorrecta o si tu cuenta fue desactivada: a propósito no se
  dice cuál de las tres cosas pasó.
- Si entraste bien, el sistema te lleva según tu rol: el **cliente** a la página de inicio (`/`),
  desde donde podés abrir el catálogo o seguir por las direcciones de la sección 2; el **vendedor** a
  su panel de inicio (`/vendedor`) y el **administrador** al suyo (`/admin`).

### 3.3 Recuperar la contraseña

1. En **Iniciar sesión** tocá **¿Olvidaste tu contraseña?** (o abrí `/recuperar-password`).
2. En **Recuperar contraseña** escribí tu correo y tocá **Enviar instrucciones**.
3. Siempre aparece el mismo mensaje, exista o no el correo: **Si el correo ingresado existe en
   nuestro sistema, vas a recibir un email con instrucciones para restablecer tu contraseña.**
4. **Importante: hoy Trendy no envía correos.** El enlace de recuperación no te llega por email: el
   servidor genera un código largo y lo escribe en su consola (solo el código, no un enlace: una línea
   `[recuperar-password] token generado para <correo>: <código>`). Quien administra el servidor te lo
   tiene que pasar y el enlace se arma así: `<dirección del sitio>/restablecer-password/<código>`. El
   enlace **vence a los 30 minutos**; solo sirve una vez.
5. Al abrir el enlace aparece **Restablecer contraseña** con **Nueva contraseña** y **Confirmar
   contraseña**. Tocá **Guardar nueva contraseña**.

Mensajes:

- Todo bien: **Contraseña actualizada con éxito. Te llevamos al login...**
- Las dos claves no coinciden: **Las contraseñas no coinciden.**
- Enlace vencido, usado o inventado: **El enlace es inválido o ya venció. Solicitá uno nuevo desde
  'Recuperar contraseña'.**
- Atención: si la contraseña nueva tiene menos de 8 caracteres, la pantalla muestra ese mismo mensaje
  del enlace inválido aunque el enlace sea bueno (es un defecto de la pantalla; el enlace no se gasta
  y podés volver a intentar con una clave más larga).

El enlace **Volver al login** de **Recuperar contraseña** y el de **Restablecer contraseña** te llevan
a **Iniciar sesión**; en **Crear cuenta** el enlace equivalente dice **¿Ya tenés cuenta? Iniciá
sesión**. La pantalla de **Iniciar sesión** no tiene ninguno.

---

## 4. Cliente

### 4.1 Resumen del camino de compra

Catálogo → detalle del producto (elegís talla y color) → **Agregar al carrito** → carrito (elegís la
dirección de envío) → **Continuar compra** → **Finalizar compra** (método de pago) → **Confirmar
pedido** → detalle del pedido → **Mis pedidos**.

### 4.2 Catálogo: buscar y filtrar

Abrí `/catalogo`. La pantalla se llama **Catálogo de productos** («Encontrá las últimas tendencias
para vos.») y arriba a la derecha dice cuántos productos hay, por ejemplo «20 productos».

A la izquierda está el panel **Filtros**:

- **Buscar** (campo «Nombre del producto...»): filtra mientras escribís. Debajo del título hay otra
  barra, «Buscar productos...» con una lupa, que filtra recién cuando tocás la lupa o apretás Enter y
  además escribe ese texto en el campo **Buscar** del panel.
- **Categoría**: «Todas las categorías», Mujer, Hombre, Jeans, Camisetas, Vestidos, Chaquetas.
- **Talla**: «Todas las tallas», XS, S, M, L, XL. Muestra los productos que tengan esa talla con stock
  (las tallas numéricas, como 30 o 32 de los jeans, no están en esta lista).
- **Precio**: dos casillas, «Mín.» y «Máx.» (en pesos).
- **Limpiar filtros** borra todos los filtros del panel, pero **no** el texto que hayas escrito en las
  barras «Buscar productos...» (la de debajo del título y la del encabezado): ese texto queda a la vista
  aunque ya no filtre. Para vaciarlo, borralo a mano o recargá la página.

Los filtros se combinan entre sí. Los productos aparecen en tarjetas de 8 por página, con paginación
abajo (← 1 2 3 →). Si nada coincide: **No encontramos productos con esos filtros.**

El catálogo **solo lista productos activos que tengan al menos una variante con stock**: cuando se
agota la última unidad de un producto, desaparece de la lista (el enlace directo a su detalle sigue
funcionando y muestra **Agotado**). Un producto desactivado no se lista y su detalle responde «No
encontramos este producto».

Cada tarjeta muestra la categoría, el nombre y el precio. El botón útil es **Ver producto**. El
corazón y el ícono de carrito de la tarjeta **no hacen nada** por ahora: para comprar tenés que entrar
al detalle.

### 4.3 Detalle del producto

Se abre con **Ver producto** (o con la dirección `/productos/<número>`). Arriba hay un recorrido de
migas: **Inicio › Catálogo › nombre del producto**. Muestra la galería de imágenes, la categoría, el
nombre, el precio, la descripción y la sección **Talla y color**.

1. Elegí una opción de **Talla y color**, por ejemplo «M · Negro». Las combinaciones sin stock están
   deshabilitadas y dicen «(agotado)». Si no queda nada de ningún talle aparece la etiqueta **Agotado**.
2. Al elegir, aparece **Stock disponible: N** y el selector **Cantidad** (botones − y +). No te deja
   superar el stock.
3. Tocá **Agregar al carrito**. Si salió bien: **Agregaste el producto a tu carrito.** con el enlace
   **Ver carrito**. Mientras trabaja el botón dice «Agregando...».
4. Mientras no elijas una variante ves la ayuda **Elegí una talla y color para agregar al carrito.**
5. Si todavía no iniciaste sesión, **Agregar al carrito** te manda a **Iniciar sesión**.
6. Un vendedor o administrador ve el producto pero no el botón de compra.
7. Si el producto no existe o está inactivo: **No encontramos este producto. Puede que ya no esté
   disponible.**

### 4.4 Mis direcciones (`/direcciones`)

Pantalla **Mis direcciones**. Si no cargaste ninguna dice **Todavía no agregaste ninguna dirección.**
Tocá **Agregar dirección** y completá el formulario:

- **Destinatario**, **Teléfono**, **Calle**, **Ciudad**, **Departamento** (obligatorios).
- **Código postal (opcional)** y **Referencia (opcional)**.
- La casilla **Usar como dirección principal**.
- Botón **Guardar dirección** («Guardando...»). Si algo falta: **No pudimos guardar la dirección.
  Revisá los datos e intentá de nuevo.**

Cada dirección guardada es una tarjeta con la etiqueta **Principal** cuando corresponde. Hoy **no se
pueden editar ni eliminar** las direcciones desde la pantalla; si te equivocás, agregá una nueva (y
marcala como principal).

Para que el envío tenga cobertura, la **Ciudad** y el **Departamento** tienen que coincidir con una
zona de cobertura activa (ver [6.4](#64-zonas-de-cobertura-y-tarifas-de-envío)); no distingue
mayúsculas ni tildes.

### 4.5 Mi carrito (`/carrito`)

Título **Mi carrito (N)**, con la cantidad de productos distintos. Si está vacío: **Tu carrito está
vacío** / «Explorá el catálogo y agregá los productos que te gusten.» y el botón **Ver catálogo**.

Cada línea muestra el nombre (con enlace al producto), «Talla M · Negro», el precio «c/u», el selector
de cantidad, el total de la línea y el botón **Eliminar**.

A la derecha está el **Resumen de compra**:

- **Dirección de envío**: si no tenés ninguna, dice «Para calcular el envío necesitás una dirección.» con
  el enlace **Agregar dirección**. Si tenés varias, se elige en la lista («Elegí una dirección»); usa
  la principal si existe.
- Con una dirección con cobertura se calcula el **Envío** (por ejemplo $8.500) y el **Total** =
  **Subtotal** + **Envío**.
- Si la ciudad no está cubierta: **No tenemos cobertura de envío para Pereira, Risaralda** (con tu
  ciudad), el envío queda en «Sin calcular» y se pide «Elegí una dirección con cobertura para
  continuar.»
- **Continuar compra** solo se habilita con envío calculado y sin líneas sin stock. **Seguir
  comprando** vuelve al catálogo.

Si el stock bajó desde que agregaste el producto, la línea dice **Solo quedan N unidades disponibles.
Ajustá la cantidad.** (o «Este producto se quedó sin stock. Eliminalo para continuar.») y debajo del
botón: **Ajustá las cantidades sin stock para continuar.** El primer clic en − te deja directamente en
el máximo disponible.

### 4.6 Finalizar compra (`/checkout`)

Pantalla **Finalizar compra**. Tiene:

- **Dirección de entrega**: lista «Elegí una dirección» (viene la que elegiste en el carrito).
- **Método de pago**, con dos opciones:
  - **Mercado Pago**: «Tarjeta, PSE y otros medios. Te llevamos al sitio seguro de Mercado Pago para
    pagar.»
  - **Pago contra entrega**: «Pagás al recibir tu pedido. Disponible solo en algunas zonas de
    cobertura.»
- **Productos (N)**: el detalle de lo que comprás, con el enlace **Modificar carrito**.
- **Resumen de compra**: **Subtotal**, **Envío**, **Total** y la nota «El precio de cada producto
  queda fijo al confirmar el pedido.»
- Botón **Confirmar pedido** (mientras trabaja: «Redirigiendo a Mercado Pago...» o «Procesando...») y
  enlace **Volver al carrito**.

**Qué pasa al confirmar con pago contra entrega.** El pedido se crea, el stock queda reservado y
llegás al detalle del pedido con el aviso: **¡Gracias por tu compra! Tu pedido PED-... quedó
registrado. Pagás al recibirlo.** El pedido figura como **Pendiente de pago** (el pago contra entrega
figura como «Pendiente») hasta que la tienda lo confirme. Pagás el total en mano al recibirlo. Solo
funciona si la zona de tu dirección tiene habilitado el contra entrega; si no, el pedido **no se
crea** y aparece: **El pago contra entrega no está disponible en la zona de tu dirección. Elegí
Mercado Pago o usá otra dirección.** La opción «Pago contra entrega» se ofrece siempre en el
checkout; la pantalla no consulta la zona de antemano y el rechazo llega al confirmar. Quien
administra la tienda puede habilitar el contra entrega de esa zona (ver
[6.4](#64-zonas-de-cobertura-y-tarifas-de-envío)).

**Qué pasa al confirmar con Mercado Pago.** El pedido se crea y el sistema intenta abrir el checkout
de Mercado Pago para que pagues. Solo se te redirige si Mercado Pago responde con un enlace válido.
Hasta que el pago se apruebe, el pedido queda **Pendiente de pago**; cuando Mercado Pago avisa que el
pago fue aprobado, el pedido pasa solo a **Confirmado**.

**El aviso «Mercado Pago no está disponible».** Hoy Mercado Pago no está configurado en este entorno.
Si elegís Mercado Pago, el pedido **sí queda registrado** (con su stock reservado), pero en vez de
abrirse Mercado Pago llegás al detalle del pedido con este aviso: **Tu pedido PED-... quedó
registrado, pero no pudimos iniciar el pago. El pago online no está disponible por ahora. Probá de
nuevo más tarde; en tus próximas compras también podés elegir pago contra entrega. Podés
reintentarlo desde acá.** En esa pantalla queda el botón **Pagar con Mercado Pago**, que repite el
intento. Mientras Mercado Pago no esté configurado, el intento vuelve a fallar con el mismo mensaje.

**El vencimiento del pago.** Un pedido de Mercado Pago tiene un plazo para pagarse: 24 horas desde que
se creó (es un valor del servidor, entre 1 y 168 horas). Pasado el plazo no se puede pagar: la
pantalla avisa **El plazo para pagar este pedido venció. El pedido se va a cancelar y los productos
vuelven a estar disponibles: podés hacer una compra nueva.** Los pedidos vencidos los cancela el
administrador con el botón **Cancelar pedidos vencidos** (ver [6.2](#62-cancelar-pedidos-vencidos)).
Los pedidos contra entrega no vencen.

**Otros mensajes del checkout** (en rojo, arriba del formulario; el pedido no se crea):

- **No hay stock suficiente de Camiseta Básica (Talla M · Negro). Quedan 3 unidades. Ajustá la
  cantidad en tu carrito para continuar.** (con el enlace **Ir al carrito**)
- **Todavía no hacemos envíos a la dirección elegida. Elegí otra dirección o agregá una nueva.**
- **Tu carrito está vacío. Si acabás de confirmar una compra, la encontrás en Mis pedidos.**
- **No pudimos confirmar si tu pedido se registró: puede que sí. Revisá «Mis pedidos» antes de volver
  a intentar.** (si se cortó la conexión: mirá **Mis pedidos** antes de comprar de nuevo para no
  duplicar).

### 4.7 Mis pedidos (`/pedidos`)

Pantalla **Mis pedidos** («Consultá tus compras y revisá su estado.»), con el botón **Actualizar**.
Muestra de a 10 pedidos, los más nuevos primero. Cada tarjeta trae el **Número de pedido** (con la
forma `PED-` seguida de muchos dígitos), el estado, la **Fecha**, el **Pago** (método) y el **Total**,
y el enlace **Ver detalle y seguimiento**. Si no compraste nada: **Aún no tenés pedidos** / «Cuando
realices una compra, aparecerá acá.» y el enlace **Explorar productos**.

### 4.8 Detalle del pedido y seguimiento del envío

Se abre con **Ver detalle y seguimiento** (`/pedidos/<número>`). Muestra:

- **Detalle del pedido**, el número y la etiqueta del estado, y los botones **Actualizar** y **←
  Volver a mis pedidos**.
- **Estado del pedido**: una frase que explica el estado (por ejemplo «Tu pedido está en camino.»),
  la **Fecha** y el **Método de pago**.
- **Pago**: **Estado del pago** (Pendiente, Aprobado, Rechazado, Cancelado o «Sin pago registrado»)
  y una explicación. En contra entrega: «Pagás $ 88.300 al recibir tu pedido.»
- Botones según el caso: **Pagar con Mercado Pago** / **Reintentar pago** (pedido de Mercado Pago
  pendiente) o **Registrar pago contra entrega** (pedido contra entrega que todavía no tiene su pago
  registrado). Si el último intento de pago falló por un motivo que reintentar no arregla, el botón
  desaparece.
- **Productos**: tabla con Producto, Variante, Cantidad, **Precio unitario** y Subtotal, y los totales
  **Subtotal**, **Costo de envío** y **Total**. El precio unitario es el que pagaste al comprar,
  aunque el producto cambie de precio después.
- **Seguimiento del envío**: cuatro pasos en orden: **En preparación**, **Enviado**, **En tránsito**,
  **Entregado**. Los pasos ya cumplidos llevan una tilde y el actual está resaltado; abajo dice
  «Última actualización del envío: fecha y hora». Antes de que el pedido esté confirmado y en
  preparación dice «El envío empieza cuando tu pedido esté confirmado y en preparación.» y ningún
  paso está marcado.
- **Dirección de entrega**: destinatario, calle, ciudad y departamento, referencia y teléfono.

Si el pedido fue **Cancelado**, en lugar de los pasos ves **Este pedido se canceló antes de salir de la
tienda.** o, si ya había salido, **El pedido ya había salido de la tienda cuando se canceló.
Comunicate con la tienda para coordinar la devolución.**

Mientras un pedido de Mercado Pago espera el pago, la pantalla se actualiza sola cada 15 segundos
durante 2 minutos; pasado ese tiempo tocá **Actualizar**.

Si abrís un pedido que no existe o que es de otra persona: **No se puede mostrar el pedido** / «No
encontramos este pedido o no tenés permiso para consultarlo.»

Hoy el seguimiento muestra solo el **paso actual** y la fecha de la última actualización; **no dibuja
el historial** con la fecha de cada paso anterior (ver [Límites conocidos](#límites-conocidos)).

---

## 5. Vendedor

Un vendedor trabaja desde su panel de inicio y cuatro pantallas de gestión. Ve **todo** (todos los
productos, pedidos y ventas).

### 5.0 Panel de inicio (`/vendedor`)

Es la pantalla a la que llegás al iniciar sesión como vendedor (también la abrís escribiendo
`/vendedor`; el encabezado no tiene un enlace a ella). Se titula **Panel de vendedor**, te saluda por
tu nombre y muestra el estado de la tienda con los datos de ese momento, todos reales, de arriba abajo:

- **Ventas**: **Ventas registradas** y **Ventas anuladas**, cada una con el total en pesos y la
  cantidad de ventas. Son las de **todas** las ventas, no las de un período.
- **Pedidos por estado**: cuatro cantidades de pedidos. **Pedidos pendientes** («Pendiente de pago»),
  **Pedidos en curso** (suma «Confirmado», «En preparación», «Enviado» y «En tránsito»), **Pedidos
  entregados** y **Pedidos cancelados**. Los estados heredados de versiones anteriores (ver
  [7.1](#71-estado-del-pedido)) no tienen tarjeta.
- **Catálogo e inventario**: **Productos activos** (los productos activos con al menos una variante
  en stock, que son los que se ven en el catálogo: uno activo con todo agotado no se cuenta),
  **Variantes con stock bajo** (de 1 a 5 unidades) y **Variantes agotadas** (0 unidades), contadas
  sobre todas las variantes del inventario.
- **Actividad reciente**:
  - **Ventas de los últimos 30 días**: un gráfico de barras con el total de ventas **registradas**
    de cada día (las anuladas no cuentan), de los últimos 30 días contando hoy, con los días en hora
    de Bogotá. Debajo hay un resumen escrito (período, cantidad, total y día de mayor venta) y el
    desplegable **Ver los datos del gráfico en una tabla**, que lista los días que tuvieron ventas.
    Si no hubo ventas en el período dice «No hay ventas registradas en los últimos 30 días.». Si las
    cifras pueden no ser exactas (hay más de 1.000 ventas en el período, o entró o salió una venta
    mientras se cargaba el gráfico), debajo del resumen aparece el aviso «Estas cifras pueden estar
    incompletas...»: recargá la página o consultá el listado de **Ventas**.
  - **Pedidos recientes**: los últimos 5 (**N.º pedido**, **Cliente**, **Estado**, **Total**,
    **Fecha**) y el enlace **Ver todos**, que abre **Gestión de pedidos**. Sin pedidos dice «Todavía no
    hay pedidos.».
  - **Ventas recientes**: las últimas 5 y el enlace **Ver todas**, que abre **Ventas**. Sin ventas dice
    «Todavía no hay ventas.».
- **Accesos rápidos**: **Pedidos**, **Ventas**, **Productos** e **Inventario**.

Cada tarjeta carga **por separado**: mientras espera muestra barras grises; si su pedido al servidor
falla, ese recuadro muestra el mensaje de error (por ejemplo «No pudimos conectarnos con el servidor.
Revisá tu conexión e intentá de nuevo.») y un botón **Reintentar** que repite solo esa consulta, sin
afectar al resto del panel. El panel no se actualiza solo: para ver datos nuevos, recargá la página.

### 5.1 Productos (`/vendedor/productos`)

Pantalla **Productos** con el botón **Nuevo producto** y una tabla: **Nombre**, **Categoría**,
**Precio**, **Estado** (se ve como «ACTIVO» o «INACTIVO») y **Acciones**: **Editar** y **Desactivar** /
**Activar**. Un producto inactivo no se ve en el catálogo.

**Crear un producto.** **Nuevo producto** abre una ventana con: **Nombre**, **Descripción**, **Precio**,
**Categoría** y **Estado** (al crear siempre es «Activo»). Tocá **Guardar**. Al guardar, la ventana
pasa a modo edición («Editar nombre») y muestra dos secciones más para el mismo producto:

- **Imágenes**: pegá la **URL de una imagen ya subida** (`https://...`) y tocá **Agregar imagen**. No
  hay carga de archivos. Antes de los parámetros (lo que sigue a un `?` o a un `#`), la dirección tiene
  que terminar en `.jpg`, `.jpeg`, `.png` o `.webp`: `https://sitio.com/foto.jpg?w=800` se acepta,
  pero una dirección cuya ruta no termina en una de esas extensiones (por ejemplo
  `https://images.unsplash.com/photo-123?w=800`) se rechaza con **No pudimos agregar la imagen.
  Verificá la URL e intentá de nuevo.** (el sistema solo mira la extensión: no comprueba que la imagen
  exista).
- **Variantes (talla, color y stock)**: completá **SKU**, **Talla**, **Color (opcional)** y **Stock** y
  tocá **Agregar variante**. Cada producto necesita al menos una variante para poder comprarse.
  Mensajes: **SKU, talla y stock son obligatorios.**, **El stock debe ser un número mayor o igual a
  0.**, si repetís la combinación, **Ya existe una variante con esa combinación de talla y color
  para este producto** y, si el SKU ya lo usa cualquier otra variante, **Ya existe una variante con
  ese SKU**. El SKU es único en **todo el catálogo**, no solo dentro del producto.

**Regla de precios:** el precio es en **pesos colombianos (COP) enteros, sin centavos**, mayor que 0 y
**no puede superar 99.999.999**. Si no se cumple, el formulario avisa:

- **El precio debe ser un valor entero en pesos (COP), sin centavos.**
- **El precio debe ser mayor a 0.**
- **El precio no puede superar 99999999 (COP).**
- También: **El nombre es obligatorio.** y **Elegí una categoría.**

**La descripción es obligatoria**, pero el formulario no lo valida: si la dejás vacía, el servidor
rechaza el producto y la pantalla muestra el aviso genérico **No pudimos guardar el producto. Intentá
de nuevo.** (sin decir que falta la descripción).

**Activar un producto exige al menos una imagen.** Si intentás pasar a «Activo» un producto sin
imágenes, el servidor lo rechaza. Desde el botón **Activar** de la tabla la pantalla muestra el aviso
genérico **No pudimos actualizar el estado del producto. Intentá de nuevo.**; desde el campo
**Estado** del formulario de edición, **El producto se guardó, pero no pudimos actualizar su estado.
Intentá cambiarlo de nuevo desde la tabla.** En ambos casos, agregá primero una imagen.

Se exige sin centavos porque Mercado Pago no acepta montos con centavos en pesos colombianos.

**Editar.** **Editar** abre la misma ventana con los datos del producto, más Imágenes y Variantes. Para
cambiar un producto entre «Activo» e «Inactivo» podés editarlo (campo **Estado**) o usar el botón
**Desactivar** / **Activar** de la tabla. Las variantes ya cargadas se pueden **agregar**, no editar ni
borrar desde esta pantalla; el stock se corrige en **Inventario**.

### 5.2 Inventario (`/vendedor/inventario`)

Pantalla **Inventario**: una tabla con **Producto**, **SKU**, **Talla / Color**, **Stock actual** y
**Acciones**. Las filas con 5 unidades o menos se resaltan como stock bajo. La casilla **Buscar por
producto o SKU...** filtra la tabla.

- **Ajustar stock** abre **Ajustar stock — nombre (SKU)**. Elegí el **Tipo de ajuste**:
  - **Entrada (ingreso de stock)**: **Cantidad a ingresar** (positiva).
  - **Salida (retiro de stock)**: **Cantidad a retirar** (positiva; el sistema la resta).
  - **Ajuste manual (corrección)**: **Cantidad (usá signo negativo para restar)** y un **Motivo**
    **obligatorio**.
  En entrada y salida el **Motivo** es opcional. Tocá **Registrar ajuste**.
  Mensajes: **La cantidad es obligatoria y debe ser un número.**, **La cantidad debe ser mayor a 0.**,
  **La cantidad no puede ser 0.**, **El motivo es obligatorio para un ajuste manual.** y, si el
  resultado sería menor que cero, **El ajuste dejaría el stock en negativo**.
- **Ver historial** abre **Historial — nombre (SKU)** con **Fecha**, **Tipo** (Entrada, Salida, Ajuste
  manual), **Cantidad**, **Motivo** y **Usuario**. El stock inicial de un producto nuevo no figura
  como movimiento. Si no hay: «Todavía no hay movimientos registrados para esta variante.»
  También aparecen los movimientos que generan los pedidos: una **Salida** con el motivo «Pedido
  confirmado (pedido #N)» (se registra al **crear** el pedido, aunque el motivo diga «confirmado») y,
  si se cancela, una **Entrada** con el motivo «Pedido cancelado (pedido #N)». En esas filas la columna
  **Usuario** muestra al **cliente dueño del pedido**, no a quien lo canceló.

### 5.3 Gestión de pedidos (`/vendedor/pedidos`)

Pantalla **Gestión de pedidos** («Consultá los pedidos y administrá su estado, envío y cobro.»), con el
botón **Actualizar**.

**Lista y filtros.** Arriba hay filtros: **Número de pedido** (por ejemplo «PED-1729...»), **Estado**
(«Todos los estados» y los estados del [glosario](#71-estado-del-pedido)), **ID del cliente**,
**Desde** y **Hasta** (fechas) y los botones **Filtrar** y **Limpiar filtros**. Avisa si el rango es
inválido («La fecha «desde» no puede ser posterior a «hasta».»). La tabla muestra **N.º pedido**,
**Cliente** (nombre y correo), **Fecha**, **Estado**, **Pago**, **Total** y **Acciones** (**Ver**), 20
por página, con «Pedidos encontrados: N».

**Detalle.** **Ver** abre el pedido con: **Cliente**, **Fecha**, **Método de pago**, **Pago**
(estado y monto), **Envío** (por ejemplo «Todavía no empezó», o «Enviado (actualizado 18/10/2026...)»),
**Dirección de entrega**, la tabla de productos con **SKU** y los totales. **← Volver a la lista** regresa.

**Acciones.** Al final del detalle, el panel **Acciones** ofrece solo lo que corresponde según el estado.
Toda acción abre una ventana de confirmación y se confirma con un botón propio (**Sí, ...**) o se
abandona con **Cancelar**.

**La cadena de estados** avanza siempre de a un paso, hacia adelante, sin saltos ni retrocesos:

**Pendiente de pago → Confirmado → En preparación → Enviado → En tránsito → Entregado**

| Estado actual | Botón | Confirmación |
| --- | --- | --- |
| Pendiente de pago (contra entrega con su pago ya registrado) | **Pasar a «Confirmado»** | **Sí, cambiar estado** |
| Confirmado | **Pasar a «En preparación»** | **Sí, cambiar estado** |
| En preparación | **Marcar envío como «Enviado»** | **Sí, actualizar envío** |
| Enviado | **Marcar envío como «En tránsito»** | **Sí, actualizar envío** |
| En tránsito | **Marcar envío como «Entregado»** | **Sí, actualizar envío** |

Con **Enviado**, **En tránsito** y **Entregado** el estado del envío y el del pedido cambian juntos.
Un pedido contra entrega **Pendiente de pago** solo se puede confirmar si el cliente ya registró su
pago contra entrega (el checkout lo hace solo); si no, la pantalla dice «El cliente todavía no
registró su pago contra entrega: el pedido no se puede confirmar hasta entonces.» Un pedido de
**Mercado Pago** pendiente no se confirma a mano: «Un pedido de Mercado Pago se confirma solo, cuando
Mercado Pago aprueba el pago.»

**Registrar cobro contra entrega.** En un pedido contra entrega cuyo pago figura como «Pendiente» (y que
no está cancelado) aparece el botón **Registrar cobro contra entrega**. Se usa cuando el repartidor ya
recibió el dinero. Pregunta «¿Registrar que se cobró $ 33.400 en efectivo por el pedido PED-...? El
pago quedará aprobado.» y se confirma con **Sí, registrar cobro**. Después de esto el pago está
**Aprobado** y **el pedido ya no se puede cancelar**: «El pedido tiene un pago aprobado: no se puede
cancelar desde el sistema (el reembolso se gestiona manualmente).»

**Cancelar un pedido.** El botón **Cancelar pedido** aparece cuando se puede cancelar (ver la tabla de
[cancelaciones](#82-cancelaciones-permitidas-y-no-permitidas)). La ventana avisa de las consecuencias,
por ejemplo: «¿Cancelar el pedido PED-...? Las 2 unidades reservadas vuelven al stock y quedan
disponibles para la venta. Como el pedido ya salió de la tienda, el stock se repone aunque la
mercadería todavía pueda no haber vuelto: confirmá que la recuperás. La venta registrada de este
pedido se anula. El pago contra entrega registrado también se cancela. Esta acción no se puede
deshacer.» Se confirma con **Sí, cancelar pedido** y queda el aviso «Pedido PED-... cancelado...». Si no
se puede cancelar, la pantalla dice por qué (por ejemplo «Un pedido ya entregado no se puede
cancelar.»).

### 5.4 Ventas (`/vendedor/ventas`, o el enlace **Ventas**)

Pantalla **Ventas** («Consultá las ventas y filtralas por fecha y estado.»). Una venta es el registro
del pedido que se confirmó; nunca se borra.

- **Filtros**: **Desde**, **Hasta**, **Estado** (Todos los estados, Registrada, Anulada), **Filtrar** y
  **Limpiar filtros**. Las fechas se interpretan en hora de Bogotá, de 00:00 a 23:59 de cada día.
  Si «desde» es posterior a «hasta»: «La fecha «desde» no puede ser posterior a «hasta».» El rango
  puede abarcar **como máximo 366 días**: la pantalla no lo valida (solo controla que «desde» no sea
  posterior a «hasta»), pero el servidor rechaza un rango más largo con **El rango de fechas no puede
  superar 366 días**.
- **Totales** (dos tarjetas): **Ventas registradas** y **Ventas anuladas**, cada una con el importe y
  la cantidad («$ 33.400 · 1 venta»). Los totales cubren **todas** las ventas del período elegido
  (**Desde**/**Hasta**), no solo la página que ves, y **no cambian con el filtro Estado**: ese filtro
  solo cambia la tabla.
- **Tabla**: **Fecha**, **N.º pedido**, **Cliente**, **Pago**, **Total**, **Estado** y **Acciones**
  (**Ver detalle**). Muestra 50 por página, con «Ventas encontradas: N». Sin resultados: «No hay ventas
  para los filtros seleccionados.»
- **Ver detalle** abre **Venta #N — pedido PED-...** con: **Pedido** (y su estado), **Estado de la
  venta**, **Fecha de la venta**, **Cliente**, **Método de pago**, **Responsable**, los productos (con
  SKU, talla y color, cantidad, precio unitario y subtotal) y **Subtotal**, **Envío**, **Total**. El
  botón **Cerrar** (o la tecla Esc) cierra la ventana.
  - **Responsable** es quien **registró** la venta (la persona que confirmó el pedido). En una venta de
    Mercado Pago dice «Registrada automáticamente por el pago».
  - Si la venta está **Anulada**, se suman **Fecha de anulación** y **Anulada por** (el vendedor o
    administrador que canceló el pedido). Pueden ser personas distintas. En una venta anulada antes de que se
    guardara este dato figura «No registrado».
- Los productos de la venta se muestran con su **precio de entonces**; el nombre, la talla y el color
  son los **actuales** (ver [Límites conocidos](#límites-conocidos)).

---

## 6. Administrador

Un administrador puede hacer todo lo del vendedor (las mismas pantallas de productos, inventario,
pedidos y ventas, con las direcciones que empiezan con `/admin/`) y además lo siguiente.

### 6.0 Panel de inicio (`/admin`)

Es la pantalla a la que llegás al iniciar sesión como administrador. Se titula **Panel de
administración** y muestra lo mismo que el panel del vendedor (ver [5.0](#50-panel-de-inicio-vendedor):
ventas, pedidos por estado, catálogo e inventario, ventas de los últimos 30 días, pedidos y ventas
recientes), con los enlaces apuntando a las pantallas `/admin/...`. Además tiene:

- La tarjeta **Clientes registrados** (en la sección **Catálogo, inventario y clientes**): cuántas
  cuentas con rol cliente hay y cuántas están activas.
- En **Accesos rápidos**, además de los cuatro del vendedor: **Vendedores**, **Usuarios**, **Roles** y
  **Zonas de envío**.

### 6.1 Usuarios (`/admin/usuarios`), Vendedores (`/admin/vendedores`) y Roles (`/admin/roles`)

- **Usuarios**: tabla con **Nombre**, **Correo**, **Rol**, **Estado** («ACTIVO» / «INACTIVO») y el
  botón **Desactivar** / **Activar**. Un usuario desactivado no puede iniciar sesión (ve «Correo o
  contraseña incorrectos.»).
- **Vendedores**: una tabla parecida pero sin la columna **Rol** (**Nombre**, **Correo**, **Estado** y
  el botón **Desactivar** / **Activar**), solo con los usuarios de rol vendedor.
  Si falla el cambio: **No pudimos actualizar el estado del vendedor. Intentá de nuevo.** (en Usuarios:
  «...del usuario...»).
- **Estas pantallas no permiten crear usuarios ni cambiar el rol de nadie.** Un cliente nuevo se
  registra solo; para crear un vendedor o un administrador el equipo técnico usa un script (ver el
  [README](../../README.md#cómo-crear-un-vendedor-o-un-administrador)).
- **Roles y permisos**: lista los tres roles (cliente, vendedor, admin), todos con «Sin permisos
  asignados». El botón **Editar permisos** abre una ventana que dice «No hay permisos configurados
  todavía (el backend no tiene un seed de permisos cargado).» **Hoy esta pantalla no tiene efecto:** lo
  que cada rol puede hacer lo definen las reglas del sistema, no esta tabla.

### 6.2 Cancelar pedidos vencidos

En **Gestión de pedidos** (`/admin/pedidos`) el administrador tiene el botón **Cancelar pedidos
vencidos** (el vendedor no lo ve). La ventana explica: «Se cancelan los pedidos de Mercado Pago que
siguen pendientes de pago después de su plazo de vigencia (configurado en el servidor) y su stock
vuelve a estar disponible. Los pedidos contra entrega y los que tienen el pago aprobado no se tocan.»
Se confirma con **Sí, cancelar vencidos**. El resultado dice cuántos se cancelaron y el criterio, por
ejemplo: «No había pedidos vencidos para cancelar. Criterio: creados antes del 17/10/2026, 2:37 p. m.
(vigencia de 24 h).» (el sistema suma 15 minutos de margen a la vigencia). **No hay un proceso
automático:** si nadie toca este botón, los pedidos vencidos siguen reservando stock.

### 6.3 Productos, inventario, pedidos y ventas

Son las mismas pantallas de la sección 5, en `/admin/productos`, `/admin/inventario`,
`/admin/pedidos` y `/admin/ventas`. El administrador además cancela los pedidos vencidos (6.2).

### 6.4 Zonas de cobertura y tarifas de envío (`/admin/envios`)

Pantalla **Zonas de cobertura y tarifas de envío**. Una **zona** es una ciudad a la que Trendy envía,
con su tarifa. La cobertura se resuelve por coincidencia exacta de **Departamento** y **Ciudad** con la
dirección del cliente (sin distinguir mayúsculas ni tildes).

La tabla muestra **Departamento**, **Ciudad**, **Zona**, **Tarifa activa** (por ejemplo «$8.500» o
«Sin tarifa activa»), **Estado** («Activa» / «Inactiva»), **Contra entrega** («Habilitado» / «No
habilitado» / «Habilitado (zona inactiva)») y **Acciones**:

- **Nueva zona**: pide **Nombre de la zona**, **Departamento**, **Ciudad** y **Costo de envío (COP)**.
  Botón **Crear zona**. Reglas: textos de hasta 100 caracteres y un costo **entero en pesos, mayor que
  cero y de hasta $1.000.000**. Mensajes: «El nombre es obligatorio.», «El costo debe ser un valor
  entero en pesos (COP), sin centavos.», etc.
- **Cambiar tarifa**: **Nuevo costo de envío (COP)** y **Guardar tarifa**. La tarifa anterior se
  desactiva y se conserva.
- **Desactivar**: pide confirmación («...Los clientes con una dirección en esa ciudad no podrán
  calcular el envío (sin cobertura) hasta que la vuelvas a activar. Las tarifas se conservan.») y se
  confirma con **Desactivar zona**. **Activar** la reactiva.
- **Habilitar contra entrega** / **Deshabilitar contra entrega**: ver el apartado siguiente.

**Contra entrega por zona.** El pago contra entrega solo está disponible en las zonas donde el
administrador lo habilitó, y se maneja desde esta pantalla. Una zona nueva nace **sin** contra entrega
(la columna dice **No habilitado**), así que hasta que alguien lo habilite, el cliente de esa ciudad
solo puede pagar con Mercado Pago.

- **Habilitar.** En una zona con la columna **No habilitado**, tocá **Habilitar contra entrega**. No
  pide confirmación: el botón pasa a «Habilitando...», la columna cambia a **Habilitado** y arriba
  aparece el aviso **Pago contra entrega habilitado en la zona (nombre de la zona).** (con el nombre de
  la zona, por ejemplo «Bogotá»).
- **Deshabilitar.** En una zona con la columna **Habilitado**, tocá **Deshabilitar contra entrega**.
  Esta acción **sí pide confirmación**, en una ventana titulada **Deshabilitar contra entrega**: «¿Deshabilitar el
  pago contra entrega en la zona (nombre) (ciudad, departamento)? Los clientes con una dirección en esa
  ciudad ya no podrán pagar así (el sistema rechazará el pedido). Los pedidos contra entrega de la zona
  que todavía no registraron su pago no podrán registrarlo: quedarán pendientes, reteniendo su stock,
  hasta que alguien los cancele a mano. Se puede volver a habilitar en cualquier momento.» Se confirma
  con **Deshabilitar contra entrega**; el foco inicial queda en **Cancelar**. Al terminar, el aviso dice
  **Pago contra entrega deshabilitado en la zona (nombre de la zona).**
- **Qué implica deshabilitar.** Además de bloquear los pedidos contra entrega nuevos en esa ciudad,
  los pedidos contra entrega de la zona que todavía no registraron su pago (ver
  [4.6](#46-finalizar-compra-checkout)) ya no pueden registrarlo. Esos pedidos quedan **Pendiente de
  pago**, con el stock reservado, hasta que el personal los cancele a mano: **Cancelar pedidos
  vencidos** ([6.2](#62-cancelar-pedidos-vencidos)) solo alcanza a los pedidos de Mercado Pago. Conviene
  revisar los pedidos pendientes de esa ciudad antes de deshabilitar.
- **Zona inactiva.** Una zona **Inactiva** también puede quedar marcada: la columna dice **Habilitado
  (zona inactiva)**. Pero una zona inactiva no tiene cobertura de envío, así que el contra entrega
  **no funciona** en ella (el cliente ve el aviso de falta de cobertura) hasta que se la vuelva a
  activar con **Activar**.
- **Si falla** el cambio, aparece arriba **No pudimos actualizar el pago contra entrega de la zona.
  Intentá de nuevo.** (dentro de la ventana de confirmación, en el caso de deshabilitar).
- El checkout **siempre ofrece** la opción «Pago contra entrega», sin consultar la zona de antemano: el
  rechazo (**El pago contra entrega no está disponible en la zona de tu dirección...**) llega recién al
  confirmar el pedido.

---

## 7. Glosario de estados

### 7.1 Estado del pedido

Es la etiqueta que se ve en **Mis pedidos**, en el detalle y en **Gestión de pedidos**.

| Etiqueta | Qué significa |
| --- | --- |
| **Pendiente de pago** | El pedido se creó y el stock está reservado. En Mercado Pago, espera el pago; en contra entrega, espera que la tienda lo confirme (se paga al recibir). |
| **Confirmado** | La tienda (o Mercado Pago, al aprobar el pago) confirmó el pedido. **Acá nace la venta.** |
| **En preparación** | La tienda arma el pedido. |
| **Enviado** | El pedido salió de la tienda. |
| **En tránsito** | El pedido está en camino. |
| **Entregado** | El pedido llegó al cliente. Ya no se puede cancelar. |
| **Cancelado** | El pedido se canceló; el stock volvió al inventario. |
| **Pago aprobado**, **Pago rechazado**, **Pago pendiente** | Etiquetas heredadas de versiones anteriores; el flujo actual no las produce, pero si aparece una se muestra igual. |

### 7.2 Estado del pago

| Etiqueta | Qué significa |
| --- | --- |
| **Pendiente** | El pago está registrado pero no cobrado (contra entrega: se paga al recibir). |
| **Aprobado** | El pago está cobrado (contra entrega: después de **Registrar cobro contra entrega**; Mercado Pago: cuando lo aprueba). Un pedido con pago aprobado no se cancela desde el sistema. |
| **Rechazado** | Mercado Pago rechazó el intento. |
| **Cancelado** | El pago se canceló junto con el pedido. |
| **Sin pago registrado** | El pedido todavía no tiene ningún pago (por ejemplo, Mercado Pago sin intentar o contra entrega sin registrar). |

Método de pago: **Mercado Pago** o **Pago contra entrega**.

### 7.3 Estado del envío

Los cuatro pasos que ve el cliente en **Seguimiento del envío**: **En preparación**, **Enviado**, **En
tránsito**, **Entregado**. Cuando el pedido está en uno de esos estados, el envío vale lo mismo. El
personal ve además **Todavía no empezó** mientras el pedido no llegó a «En preparación» (y **No salió de
la tienda (pedido cancelado)** si se canceló antes de salir). Atención: un pedido recién confirmado
puede mostrar «Todavía no empezó» aunque internamente el envío ya esté marcado «En preparación»; manda
el estado del pedido.

### 7.4 Estado de la venta

| Etiqueta | Qué significa |
| --- | --- |
| **Registrada** | La venta está vigente: el pedido se confirmó y sigue en pie. |
| **Anulada** | Se canceló el pedido. La venta no se borra: queda anulada con su **Fecha de anulación** y **Anulada por**. |

### 7.5 Otros estados que vas a ver

- Productos y usuarios: **ACTIVO** / **INACTIVO**. Zonas: **Activa** / **Inactiva**.
- Movimientos de inventario: **Entrada**, **Salida**, **Ajuste manual**.

## 8. Reglas importantes, explicadas simple

### 8.1 El stock

- **El stock se descuenta cuando se crea el pedido**, no cuando se paga. Es una reserva: las unidades
  quedan apartadas para ese pedido. Por eso un pedido de Mercado Pago que nadie paga sigue reservando
  mercadería hasta que se cancele.
- Al **cancelar** un pedido el stock se repone, una sola vez.
- El stock también cambia con los ajustes de **Inventario** (entrada, salida, ajuste manual); nunca
  puede quedar en negativo.

### 8.2 Cancelaciones permitidas y no permitidas

Solo cancela el personal (vendedor o administrador); el cliente no puede.

| Pedido | Se puede cancelar | No se puede cancelar |
| --- | --- | --- |
| Cualquier método | **Pendiente de pago** | |
| **Contra entrega** | **Confirmado**, **En preparación**, **Enviado**, **En tránsito** (si el cobro aún no está registrado) | **Entregado** |
| **Mercado Pago** pagado | | Cualquier estado desde Confirmado: el reembolso se hace a mano, fuera del sistema |
| Cualquiera con el **pago Aprobado** | | Nunca desde el sistema |

Cancelar un contra entrega ya confirmado **anula su venta** y repone el stock. Desde **Enviado** o **En
tránsito** el sistema repone el stock suponiendo que la mercadería vuelve, aunque todavía no haya
vuelto: confirmá que la recuperás.

### 8.3 La venta y quién la anuló

- La venta **nace cuando el pedido pasa a Confirmado**, no cuando se paga. Con Mercado Pago, cuando se
  aprueba el pago; con contra entrega, cuando el personal confirma el pedido (aunque el cobro se
  registre después).
- Hay una sola venta por pedido y se **anula, nunca se borra**.
- Son dos datos distintos: **Responsable** es quien **registró** la venta y **Anulada por** es quien
  **canceló** el pedido.

### 8.4 Contra entrega y zonas

El contra entrega solo funciona en las zonas donde el administrador lo habilitó, desde **Zonas de
cobertura** (ver [6.4](#64-zonas-de-cobertura-y-tarifas-de-envío)). Si el cliente lo elige en otra
zona, el pedido no se crea y se le avisa (ver [4.6](#46-finalizar-compra-checkout)). Si el
administrador lo deshabilita después, los pedidos contra entrega de esa zona que todavía no habían
registrado su pago ya no pueden registrarlo y quedan pendientes, con su stock reservado, hasta que el
personal los cancele a mano.

### 8.5 Pesos enteros

Todos los montos de Trendy son **pesos colombianos (COP) enteros**: los productos (hasta 99.999.999) y
las tarifas de envío (hasta 1.000.000) no pueden tener centavos.

### 8.6 El precio queda fijo

El precio de cada producto queda fijo cuando el pedido **se crea**, es decir, cuando el cliente toca
**Confirmar pedido** en el checkout (no cuando el pedido pasa al estado «Confirmado»). Si después
cambia en el catálogo, el pedido conserva el precio de ese momento. La venta, que nace cuando el pedido
pasa a «Confirmado», copia los importes del pedido (subtotal, envío y total), así que también conserva
ese precio.

### 8.7 Vendedores y administradores ven todo

En esta versión no existen «pedidos o ventas asignados» a cada vendedor: tanto el vendedor como el
administrador ven todos los pedidos, todas las ventas y los mismos totales.

---

## 9. Problemas frecuentes

Los mensajes de esta tabla salen de la aplicación; los que dicen «poco comunes» o dependen de datos
particulares se leyeron en el código y no se reprodujeron en pantalla.

| Lo que ves | Qué pasó y qué hacer |
| --- | --- |
| **Correo o contraseña incorrectos.** | Revisá el correo y la clave. También sale si la cuenta está desactivada: pedile al administrador que la active. |
| **Ese correo ya está registrado.** | Ya hay una cuenta con ese correo: iniciá sesión o usá **¿Olvidaste tu contraseña?**. |
| **No pudimos completar el registro. Revisá los datos e intentá de nuevo.** | Falta o está mal algún dato; la contraseña necesita al menos 8 caracteres. Si al correo le falta la arroba («@»), el navegador lo frena antes con su propio aviso. |
| No me llega el correo de recuperación | Hoy Trendy no envía correos; en la consola del servidor sale solo un código. Pedíselo a quien administra el sistema: el enlace es `<dirección del sitio>/restablecer-password/<código>`. |
| **El enlace es inválido o ya venció. Solicitá uno nuevo desde 'Recuperar contraseña'.** | El enlace venció (30 minutos), ya se usó, o la clave nueva tiene menos de 8 caracteres. Probá con una clave más larga o pedí otro enlace. |
| Entré a una dirección y volví a la página de inicio | Esa pantalla es de otro rol. Si no iniciaste sesión te lleva a **Iniciar sesión**. |
| **No encontramos esta página** | La dirección que escribiste no existe (puede tener un error de tipeo). Tocá **Ir al inicio** o **Ver el catálogo**, o revisá la tabla de la sección [2](#2-antes-de-empezar-cómo-moverte). |
| Mi sesión se cerró sola | La sesión dura 1 hora. Volvé a iniciar sesión. |
| **No tenemos cobertura de envío para (tu ciudad)** | Esa ciudad no tiene zona activa. Elegí otra dirección o consultá a la tienda. |
| **Solo quedan N unidades disponibles. Ajustá la cantidad.** | Alguien compró antes que vos. Bajá la cantidad (el primer − te deja en el máximo) o eliminá la línea. |
| **No hay stock suficiente de ... Ajustá la cantidad en tu carrito para continuar.** | Igual que el anterior, detectado al confirmar. El pedido no se creó. |
| **El pago contra entrega no está disponible en la zona de tu dirección. Elegí Mercado Pago o usá otra dirección.** | La zona no tiene contra entrega habilitado. El pedido no se creó. Si sos administrador, habilitalo en **Zonas de cobertura** (`/admin/envios`, botón **Habilitar contra entrega**; ver [6.4](#64-zonas-de-cobertura-y-tarifas-de-envío)) y pedile al cliente que confirme de nuevo; si no, elegí Mercado Pago u otra dirección. |
| **Tu pedido PED-... quedó registrado, pero no pudimos iniciar el pago. El pago online no está disponible por ahora...** | Mercado Pago no está disponible o configurado. El pedido existe y reserva stock; usá **Pagar con Mercado Pago** más tarde o pedí a la tienda que lo cancele. |
| **El plazo para pagar este pedido venció...** | Pasó la vigencia del pago. Hacé una compra nueva; el administrador cancela los vencidos. |
| **No pudimos confirmar si tu pedido se registró: puede que sí.** | Se cortó la conexión. Mirá **Mis pedidos** antes de volver a intentar. |
| **El precio debe ser un valor entero en pesos (COP), sin centavos.** | Quitá los centavos del precio (o del costo de envío). |
| **El precio no puede superar 99999999 (COP).** | Bajá el precio: el tope es 99.999.999. |
| **No pudimos agregar la imagen. Verificá la URL e intentá de nuevo.** | La ruta de la URL no termina en jpg, jpeg, png o webp (los parámetros después de un `?` o `#` no cuentan: `foto.jpg?w=800` sirve, `photo-123?w=800` no). Usá una dirección directa a la imagen. |
| **Ya existe una variante con esa combinación de talla y color para este producto** | Esa talla y color ya están cargados; ajustá su stock en **Inventario**. |
| **Ya existe una variante con ese SKU** | Otra variante (de este u otro producto) ya usa ese SKU: el SKU es único en todo el catálogo. Elegí otro. |
| **No pudimos guardar el producto. Intentá de nuevo.** | Puede faltar la **Descripción**, que es obligatoria aunque el formulario no lo avise. Completala y guardá de nuevo. |
| **No pudimos actualizar el estado del producto. Intentá de nuevo.** | Al activar un producto sin imágenes el servidor lo rechaza: agregá antes al menos una imagen. |
| **El ajuste dejaría el stock en negativo** | Estás retirando más unidades de las que hay. Bajá la cantidad. |
| **El motivo es obligatorio para un ajuste manual.** | Explicá por qué corregís el stock. |
| «El pedido tiene un pago aprobado: no se puede cancelar desde el sistema» | Ya se cobró (o Mercado Pago lo aprobó). Es lo que ve el personal en un pedido confirmado de Mercado Pago con el pago aprobado. El reembolso se gestiona manualmente. |
| «Un pedido de Mercado Pago ya pagado no se puede cancelar desde el sistema (el reembolso se gestiona manualmente).» | Un pedido de Mercado Pago que ya salió de «Pendiente de pago» no se cancela desde el sistema (si su pago figura como aprobado, sale el aviso de la fila anterior). |
| «Un pedido ya entregado no se puede cancelar.» | Correcto: un pedido entregado no se cancela. |
| «Solo se pueden cancelar los pedidos pendientes de pago y los contra entrega que todavía no se entregaron.» | Aparece solo en casos poco comunes, con un pedido en un estado heredado de versiones anteriores (ver [7.1](#71-estado-del-pedido)) que no encaja en ninguno de los motivos anteriores. |
| «El cliente todavía no registró su pago contra entrega: el pedido no se puede confirmar hasta entonces.» | Pedile al cliente que, en el detalle de su pedido, toque **Registrar pago contra entrega**. |
| **La fecha «desde» no puede ser posterior a «hasta».** | Corregí el rango de fechas del filtro. |
| **El rango de fechas no puede superar 366 días** | En **Ventas**, achicá el período entre **Desde** y **Hasta**. |
| La pantalla no se actualiza | Tocá **Actualizar**. |
| Una tarjeta del panel de inicio muestra un mensaje de error («No pudimos cargar...» o «No pudimos conectarnos con el servidor...») | Falló la consulta de esa tarjeta, el resto sigue bien. Tocá **Reintentar** en la tarjeta. |

---

## Límites conocidos

Esto es lo que la versión 1.0 todavía **no** hace o no hace bien. Se dice con honestidad para que
nadie se lleve una sorpresa. El detalle técnico está en `docs/bitacora/sprint-5-revision-retrospectiva.md`
(sección «Deuda y puntos abiertos»).

**Pagos**

- **Mercado Pago real nunca se probó**, ni en el entorno de pruebas ni en producción. El sistema está
  construido y probado con una simulación; no hay un servidor público que reciba el aviso de pago de
  Mercado Pago. No debe usarse con dinero real hasta pasar esa prueba. Si no está configurado, el
  checkout muestra el aviso descrito en [4.6](#46-finalizar-compra-checkout).
- No hay **reembolsos** en el sistema: cancelar un pedido con pago aprobado no se puede y se resuelve a
  mano.
- Un vendedor puede cancelar un contra entrega (mientras el cobro no esté registrado); lo único que
  deja control es el dato **Anulada por**.
- Los pedidos vencidos solo se cancelan si el administrador toca **Cancelar pedidos vencidos**. Los
  pedidos contra entrega nunca vencen.

**Pantallas y navegación**

- **No hay menú de navegación ni botón para cerrar sesión** (ver sección 2). La página de inicio solo
  enlaza al catálogo y a los productos: las categorías que muestra no preseleccionan el filtro.
- El **historial del envío no se dibuja** en la pantalla del cliente: el sistema ya lo guarda y lo
  entrega, pero solo se ve el paso actual.
- El corazón y el carrito de las tarjetas del catálogo no hacen nada; la lupa y el ícono de persona del
  encabezado, tampoco.
- Las direcciones no se pueden editar ni eliminar.
- **Roles y permisos** no tiene permisos configurados y no gobierna nada.
- **Contra entrega por zona**: el checkout siempre ofrece la opción y el rechazo llega recién al
  confirmar; y deshabilitar una zona deja sus pedidos contra entrega sin pago registrado pendientes
  hasta que el personal los cancele a mano (ver [6.4](#64-zonas-de-cobertura-y-tarifas-de-envío)).
- **No se pueden crear vendedores ni administradores desde la aplicación** (los crea el equipo técnico
  con un script).
- El panel de inicio del personal (`/admin` y `/vendedor`) es más simple que el de los mapas de
  pantalla: no tiene variaciones porcentuales respecto del período anterior, ni selector de período
  (el gráfico es siempre de los últimos 30 días), ni «pedidos del mes» ni «stock total». No tiene
  enlace en el encabezado (se llega al iniciar sesión o escribiendo la dirección), no se actualiza
  solo, y «Productos activos» cuenta solo los productos con al menos una variante en stock (la
  consulta de productos es la misma del catálogo público).
- En el historial de inventario, la reposición por una cancelación figura a nombre del cliente dueño
  del pedido, no de quien canceló. Quien canceló queda registrado en la venta («Anulada por»), no en
  el inventario.
- El formato de la moneda no es uniforme: a veces se ve «$39.900» (catálogo, carrito) y a veces «$
  39.900» (checkout, pedidos, ventas).
- Algunos textos tienen detalles de redacción («1 unidades», «La ciudad es obligatorio»).
- Las ventanas emergentes todavía no tienen todas las ayudas de accesibilidad; no se probó con lector
  de pantalla.

**Datos**

- Las ventas y los pedidos muestran el **nombre, la talla y el color actuales** del producto; solo el
  precio es el histórico. Si renombrás un producto, las ventas viejas muestran el nombre nuevo.
- El vendedor ve todo; no hay «ventas asignadas».
- Un contra entrega **no se puede cancelar una vez cobrado**, y una venta anulada **no se reactiva**.
- Desactivar a un usuario impide que vuelva a iniciar sesión, pero según la bitácora el sistema no
  vuelve a validarlo en cada petición, así que una sesión ya abierta podría seguir funcionando hasta
  que venza (1 hora).

**Fuera de alcance de la versión 1.0** (planificado para la versión 2.0): cancelación de pedidos por
parte del cliente, notificaciones por correo, reportes de ventas e inventario.

## Por verificar

Cosas que se leyeron en el código o en la documentación pero **no se reprodujeron** en pantalla:

- El mensaje **El plazo para pagar este pedido venció...** y la cancelación automática por vencimiento
  (requiere esperar 24 horas o cambiar la configuración del servidor).
- El flujo completo de Mercado Pago aprobado: redirección, aviso de pago y confirmación automática
  del pedido (nunca se probó, ver Límites conocidos).
- El comportamiento en celular (la bitácora del Sprint 5 solo lo verificó para el panel de ventas) y
  con lector de pantalla o solo teclado.
- Que una sesión abierta siga funcionando después de desactivar al usuario (dato tomado de la
  bitácora).
- Los mensajes del checkout «Todavía no hacemos envíos a la dirección elegida...» y «Tu carrito está
  vacío. Si acabás de confirmar una compra...» (se leyeron en el código; las situaciones que los
  disparan son poco comunes).
