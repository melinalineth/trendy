# Sprint 5 — Revisión y retrospectiva

RF cubiertos: RF-041 (registro de ventas) y RF-042 (consulta de ventas), MOD-09.
RF-043 (reporte básico de ventas) y RF-044 (reporte de inventario) siguen **diferidos a v2.0** (ERS §2.8.3 y DDS MOD-09).

Verificado el 18/10/2026 sobre la punta de `sprint-5-base` (`6409311`), que parte de `main` (`f3696e3`, con Sprint 4 completo): **0 commits detrás de `main`**, 70 commits propios sin merges (82 con merges), 69 archivos, +8.142 / −543, tres migraciones nuevas.

**Calendario real.** El 17/10 se aclaró que el proyecto empezó el 01/08/2026 y **termina el 31/10/2026**; las fechas del Plan de Trabajo (Sprint 5 del 10/11 al 21/11, Cierre del 24/11 al 05/12) estaban equivocadas. Las tarjetas se reprogramaron entre el 17/10 y el 31/10, y el Sprint 5 se ejecutó el 17 y el 18/10.

## Resultado de la verificación automática

Suite completa del backend contra una base descartable (migrada, con nombre «scratch»): **798/798**, 140 suites, ~37 s, corrida sobre la punta mergeada (`6409311`). El comando es `DOTENV_CONFIG_QUIET=true node --require dotenv/config --test --test-concurrency=1`; `npm test` a secas falla en los archivos que importan `config/prisma` antes de cargar `dotenv` (deuda conocida, ver abajo).

Evolución de la suite: 556 en la punta de `sprint-4` → 571 (modelo `Venta`) → 673 (registro de ventas) → 786 (consulta y `anuladaPorId`) → 793 (`anuladaPor` en la API) → 798 (endpoint de salud). El helper `tests/helpers/entorno.js` se sigue negando a correr si el nombre de la base no contiene `test` o `scratch`.

Cada integración de ramas se verificó **corriendo la suite sobre el estado ya mergeado**, no solo en cada rama: dos PR que tocaban los mismos archivos pasaron por separado y también juntos (786/786 = 673 + 98 + 15).

## QA manual en navegador (18/10, base descartable, backend y frontend reales)

Recorrido de punta a punta con un cliente, un vendedor y un admin, sobre la rama que incluía «quién anuló» (primera vez que el panel de ventas hablaba con el `GET /api/v1/ventas` real; antes solo se había probado contra un mock):

| Prueba | Resultado |
|---|---|
| Compra real como cliente con contra entrega (zona habilitada, 2 unidades, envío $8.500, total $88.300) | ✅ Stock descontado al crear |
| El admin confirma el pedido: la venta aparece en `/admin/ventas` con montos correctos, fecha en hora de Bogotá, tarjetas de totales y modal de detalle con precios históricos | ✅ |
| Cancelar un contra entrega confirmado desde el panel (botón nuevo, modal que avisa que se anula la venta) | ✅ Stock repuesto (15→16), venta «Anulada» con fecha y «Anulada por» |
| Un vendedor cancela lo que confirmó el admin | ✅ «Anulada por» = vendedor, «Responsable» = admin |
| Vendedor ve las mismas ventas y los mismos totales que el admin; el cliente es redirigido a `/`; `GET /ventas` con token de cliente da 403 | ✅ |
| Filtros (desde/hasta con el borde del día en hora de Bogotá, estado, rango inválido sin petición, «Limpiar filtros») | ✅ |
| 127 ventas de prueba: 3 páginas de 50, filtros conservados al paginar, 375 px sin scroll horizontal de página | ✅ |
| Contrato: el JSON real trae exactamente los campos esperados, con los importes como número | ✅ Sin discrepancias entre backend y frontend |
| Consola | Solo los 409/403/400 provocados a propósito |

Staging local con Docker Compose (`docs/despliegue/staging.md`): `scripts/smoke-staging.js` dio **29/29** en dos ciclos, uno de ellos desde cero (migraciones y seed), con nginx escuchando solo en `127.0.0.1`. Pruebas negativas: un `JWT_SECRET` de ejemplo aborta el contenedor sin imprimir el valor; una contraseña de MySQL con `@` falla de inmediato.

## Criterios de aceptación por RF

| RF | Estado | Nota |
|---|---|---|
| RF-041 registro de ventas | ✅ | Una venta por pedido (único en la base), montos copiados del pedido leído bajo lock (RN-008), idempotente ante webhook repetido, simultáneo o pago duplicado; se registra al pasar a CONFIRMADO (webhook de Mercado Pago o cambio manual de estado). **Con Mercado Pago real nunca se probó** (SDK mockeado) |
| RF-042 consulta de ventas | ✅ | `GET /api/v1/ventas` para admin y vendedor (ambos ven **todas** las ventas y los totales: las «ventas asignadas» quedan para una versión posterior); filtros en hora de Bogotá, paginación, totales del período; panel con detalle |
| Anulación de contra entrega | ✅ | Decisión del usuario: admin y vendedor pueden cancelar un contra entrega desde CONFIRMADO, EN_PREPARACION, ENVIADO y EN_TRANSITO (repone stock y anula la venta); no desde ENTREGADO, y los pedidos de Mercado Pago pagados quedan fuera (el reembolso no está en el alcance) |
| Quién anuló la venta | ✅ | `Venta.anuladaPorId` (clave foránea `RESTRICT`), visible en la API y en el detalle; `responsableId` sigue siendo quien la **registró** |
| RF-043, RF-044 | ⏳ | Diferidos a v2.0 |

## Hallazgos de las revisiones independientes

Cada PR de código, salvo los dos indicados abajo, pasó por una revisión en contexto fresco que encontró problemas reales, todos corregidos antes de mergear:

1. **Foto vieja dentro de una transacción** (PR #36, repository de Valentina Ortiz): con REPEATABLE READ, la relectura tras el error de unicidad no veía la venta que otro acababa de confirmar. Ahora esas lecturas usan `SELECT ... FOR UPDATE`; dos tests lo reproducen.
2. **Fechas extremas** (PR #39, DTO de Valentina Linares): `hasta=9999-12-31` y los años menores a 1000 producían un `Invalid Date` que llegaba a Prisma y terminaba en un 500 que devolvía el texto interno del error. Ahora los instantes se calculan con `Date.UTC` y se aceptan solo años 2000 a 2100.
3. **El código de error del 400 que yo mismo fijé en el contrato** (`FILTROS_INVALIDOS`) rompía la convención de todo el proyecto (`VALIDACION_FALLIDA`); también sobraban puntos finales en los detalles. Un contrato que fija el desarrollador también necesita revisión.
4. **`aCentavos` duplicada** entre `pedido.service` y `venta.service` por un ciclo de módulos: pasó a un módulo hoja compartido (`utils/montos.js`), movida byte por byte.
5. **La regla nueva era inalcanzable desde la pantalla**: el panel de pedidos solo ofrecía «Cancelar pedido» para pendientes. Se replicó la regla del backend caso por caso y se corrigieron textos falsos («no tiene envío» para un pedido que sí salió).
6. **Frontend de ventas**: un posible bucle de peticiones al saltar de página, la paginación desbordaba a 375 px y todos los botones «Ver detalle» tenían el mismo nombre accesible.
7. **Staging**: el `Dockerfile` existente **no arrancaba** (la CLI `prisma` es una devDependency y la imagen usaba `--omit=dev`), el compose usaba el `.env` de desarrollo, el seed no creaba ningún usuario, y la plantilla traía credenciales conocidas con nginx publicado en `0.0.0.0`. Ahora el backend se niega a arrancar con secretos de ejemplo y nginx escucha solo en `127.0.0.1`.
8. **Tests**: uno que fallaría apenas existiera otra migración, uno de privacidad que podía pasar en vacío y aislamientos por año que no toleraban restos de una corrida cortada.

**Sin revisión independiente en contexto fresco:** el PR #41 (`anuladaPor` en la API y el detalle), el #43 (precio con separador de miles y botón «Cerrar») y el #44 (test de integración del flujo de compra). Son cambios chicos que repiten un patrón existente o agregan solo un test; quedó dicho en el cuerpo de cada PR. Tampoco tuvo revisión el PR #35, que solo integra `main` en `sprint-5-base` sin código nuevo.

## Qué funcionó

- **Fijar el contrato de la API en un documento antes de trabajar en paralelo** (`docs/diseno/ventas-api.md`) y revisarlo contra el consumidor real: backend y frontend se escribieron por separado y el recorrido de punta a punta no encontró ninguna discrepancia.
- **Conservar la autoría de las compañeras**: el repository de Valentina Ortiz y sus páginas y rutas se trajeron con `cherry-pick`; el DTO de Valentina Linares con un commit propio con su nombre. Los PR se mergean con «Create a merge commit», nunca con squash.
- **TDD y mutaciones**: sacar el registro de la transacción, el campo del `select` o la hora de Bogotá hace fallar los tests, o sea que detectan lo que dicen detectar.
- **Verificar la suite sobre el estado mergeado** después de cada integración, y declarar con franqueza en cada PR qué no se verificó.
- **Docker con límites**: proyecto de Compose propio, sin `prune`, y comparación de los recursos ajenos antes y después; quedaron idénticos.

## Qué no funcionó / ajustes

- **Las fechas del Plan de Trabajo estaban equivocadas** y se descubrió recién el 17/10. Hay que revisar el Plan contra el calendario real antes de empezar un sprint.
- **El trabajo quedó concentrado en una persona**: de los 70 commits propios, 66 son de Oscar Pérez, 3 de Valentina Ortiz y 1 de Valentina Linares. Fue una decisión consciente por el plazo (el Sprint 5 se implementó con asistencia de IA para llegar al 31/10), pero el equipo debería acordar cómo se presenta esa autoría en la entrega y cómo se reparte el cierre.
- **Las ramas `sprint-5` y `sprint-5-nuevo` no eran integrables** (salían del `sprint-4` viejo, no cargaban y una pisaba los servicios reales de pagos con stubs). Se rescató de ellas lo útil y no se mergearon; siguen en el remoto.
- **Avisos de «falló» desactualizados**: tres notificaciones de agentes por un límite de uso semanal llegaron cuando el trabajo ya estaba hecho o seguía activo. Antes de actuar hay que mirar `git status` y `git log` del worktree.
- **Los permisos del entorno impiden leer, copiar o crear archivos `.env*`**: hubo que pedirle al usuario que copiara el `.env` a cada worktree, y la plantilla de staging se llama `staging.env.example` en vez de `.env.staging.example`.
- Algunos agentes usaron `ls`, `grep` o `sed` contra la regla del usuario; fueron lecturas inofensivas, pero conviene repetirla en cada encargo.
- **Cuerpos de PR largos con comillas fallaron en el shell**: se escriben con la herramienta de archivos.

## Deuda y puntos abiertos

**Antes de usar el sistema con dinero real**
1. **Mercado Pago real**: sandbox o producción nunca se probaron (firma del webhook, formato de fechas con `-05:00`, `date_of_expiration`, rechazo de centavos en COP). Hay una excepción documentada desde el Sprint 4 (tarjeta `[Sprint 4 - 07] [02]` sigue abierta); no usar credenciales de producción hasta pasar la prueba.
2. **Un vendedor puede anular un contra entrega ya cobrado en mano** sin otro control que el registro de «quién anuló» (que ahora existe); los reembolsos de Mercado Pago están fuera de alcance.
3. **Reponer stock desde ENVIADO o EN_TRANSITO** asume que la mercadería vuelve; es una decisión del desarrollo, a confirmar con el dueño del negocio.

**Seguridad y robustez**
4. `errorHandler` devuelve `err.message` en cualquier 5xx (puede filtrar texto interno), y `auth.js` no revalida al usuario contra la base y responde el 401 con otro formato (`{error: "texto"}`).
5. Tras reiniciar MySQL, el pool del adaptador MariaDB queda inutilizable y el backend tarda varios minutos en recuperarse (observado en una corrida local); `docker compose restart backend` lo arregla.
6. `main` no tiene protección de rama: la regla «todo por Pull Request» es un acuerdo, no algo que GitHub haga cumplir (requiere un admin).
7. `/api/v1/health` es público y sin límite de peticiones; el chequeo con timeout no cancela la consulta. Paginación profunda de `/ventas` (hasta la página 100000) recorre muchas filas.

**Datos y modelo**
8. `DetallePedido` no guarda un snapshot de nombre, SKU, talla ni color: las ventas muestran los **actuales**; solo el precio es histórico. También los nombres de cliente y responsable. Arreglarlo exige una migración.
9. Los pedidos que ya estaban confirmados antes del código de ventas no tienen venta y no la obtienen al avanzar; el backfill corre una sola vez dentro de la migración (solo afecta a bases de desarrollo).
10. Productos o tarifas ya cargados con centavos dejan un pedido de Mercado Pago imposible de crear; revisar el catálogo con las consultas de `docs/diseno/montos-cop.md` antes de habilitar pagos.
11. El seed sobrescribe `imagen.url` en cada corrida (con `RUN_SEED=true`); `ProductoImagen` pierde ediciones manuales.

**Interfaz**
12. «Envío: Todavía no empezó» en un pedido recién confirmado cuyo envío ya está en `EN_PREPARACION`, y el botón «Registrar cobro contra entrega» en un pedido ya `ENTREGADO` (vienen del Sprint 4).
13. El formato de moneda no es uniforme (`$39.900` en el carrito y el catálogo frente a `$ 39.900` en checkout, pedidos y ventas); `ProductCard` antepone el `$` por su cuenta.
14. El seguimiento del cliente todavía no dibuja el historial de estados de envío (la API ya lo devuelve); solo existe el enlace «Ventas» en el Header para el personal, sin navegación para pedidos, inventario ni envíos; los dashboards siguen con datos de ejemplo.
15. Accesibilidad de los componentes comunes (`Modal` sin `role="dialog"` ni gestión de foco, `Input` sin `id`/`aria-*`).
16. `GET /ventas` se pide dos veces por carga en desarrollo (modo estricto de React); no ocurre en producción.

**Proceso**
17. `npm test` a secas falla en los archivos que importan `config/prisma` antes de cargar `dotenv`; hay que arreglar el script o el orden de carga.
18. No hay scheduler para `POST /api/v1/pedidos/vencidos/cancelar`; no hay VPS ni URL pública, así que el webhook de Mercado Pago no puede probarse fuera de una máquina con túnel.

## No verificado en esta revisión

- Mercado Pago real (sandbox o producción) en cualquiera de sus partes, y una venta generada por el webhook real.
- El staging fuera de la máquina de desarrollo (no hay VPS), HTTPS y red pública; la recuperación del pool tras reiniciar MySQL en una segunda corrida; el reinicio automático tras reiniciar Docker (solo se comprobó la configuración).
- Teclado y lector de pantalla; el cambio del PR #43 en el navegador.
- La suite del backend dentro de la imagen de Docker (solo el test de salud y 80 tests sin base).
- Concurrencia con varias instancias del servidor o más de unos pocos escritores simultáneos (los tests de concurrencia usan entre 4 y 6 peticiones).
- No se midió el plan de ejecución de las consultas de ventas.

## Cierre de rama

El merge de `sprint-5-base` a `main` va por Pull Request revisado (tarjeta «[Sprint 5 - 11]»); según el Plan de Trabajo §2.1 necesita la aprobación de Melina o de Valentina (no se puede auto-aprobar). Mergear con «Create a merge commit» para conservar la autoría de Valentina Ortiz y Valentina Linares. Antes de abrirlo conviene que el equipo lea los puntos 1 a 3 de «Deuda» y acepte explícitamente las excepciones. Al mergear: `git tag sprint-5-done` y `git push origin sprint-5-done`.

## Actualización 18/10/2026

**Tarjeta 06-01** (PR #44, solo agrega un test): una historia de punta a punta por HTTP — carrito, pedido contra entrega, pago, confirmación, venta, cambio de precio posterior (RN-008), cancelación por un segundo admin, venta anulada, cancelación repetida — con **9 casos**. Con ese PR la suite completa queda en **807/807** (798 + 9), corrida dos veces. Se probó que discrimina con dos mutaciones temporales (sacar el registro de la venta al confirmar y sacar la reposición de stock en la cancelación) y no se encontraron bugs de producción. Es una cadena contra entrega: el equivalente con Mercado Pago real sigue sin probarse. Este PR, como el #41 y el #43, no pasó por una revisión independiente en contexto fresco.
