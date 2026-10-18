# Sprint 4 — Revisión y retrospectiva

RF cubiertos: RF-030, RF-031, RF-032 (MOD-06 Pedidos), RF-034 a RF-038 (MOD-07 Pagos) y cierre parcial de RF-027, RF-028, RF-029 (MOD-05 Envío).
RF-033 (cancelación por el cliente) queda **diferido a v2.0** (ERS §2.8.3); la cancelación la gestiona el personal.

Verificado el 17/10/2026 sobre la punta de `sprint-4` (`58a92a1`, incluye los PR #21 a #27 y todo Sprint 3 de `main`).

## Resultado de la verificación automática

`cd backend && npm test` contra una base descartable (migrada y con seed): **451/451**, 67 suites, ~18 s. La app carga sin base real. `sprint-4` está **0 commits detrás de `main`** (59 adelante, 83 archivos, +12.513 / −82).

Cobertura por archivo (casos `it(`): pagos con Mercado Pago 51, contra entrega 34, carrito 25, cancelación de pedidos 23, zonas 22, descuento de inventario 19, creación de pedidos 18, consulta de pedidos 18, ajuste de inventario 18, reposición 13, envío 10 y 9, transiciones de envío 10, contra entrega por zona 7, reintentos de transacción 7. El helper (`tests/helpers/entorno.js`) **se niega a correr si el nombre de la base no contiene `test` o `scratch`**. `npm test` corre con `--test-concurrency=1`: los archivos de test entraban en deadlock entre sí al limpiar usuarios (causa probable: aislamiento de tests, no producción).

## QA manual en navegador (17/10, base descartable, dos clientes, un vendedor y un admin)

| Prueba | Resultado |
|---|---|
| Panel de gestión **como vendedor**: lista, detalle, cadena Confirmado → En preparación → Enviado → En tránsito → Entregado, registrar cobro contra entrega, cancelar | ✅ En cada modal el foco inicial cae en "Cancelar"; en la base el pedido y su envío quedan sincronizados |
| El vendedor **no** ve "Cancelar pedidos vencidos" (solo admin) | ✅ |
| Cancelar como vendedor | ✅ Pedido y pago `CANCELADO`, stock repuesto (par `SALIDA`/`ENTRADA` en el historial) |
| Rutas prohibidas para el vendedor (`/admin/pedidos`, `/checkout`, `/pedidos`, `/pedidos/1`, `/admin/envios`, `/admin/usuarios`) | ✅ Todas redirigen a `/` |
| **Aislamiento entre clientes**: el cliente A ve solo su pedido; el pedido del cliente B da "No encontramos este pedido"; no accede a los paneles | ✅ |
| Responsive a 375 px (inicio, catálogo, producto, carrito y checkout con productos, mis pedidos, detalle, direcciones, panel y detalle del panel) | ✅ Ninguna página desborda; las tablas anchas (producto 539 px, panel 792 px) hacen scroll dentro de su contenedor |
| Carga de la app sobre la punta integrada | ✅ Sin overlay de error de Vite ni errores de React |
| Consola | Solo 404 esperados de la prueba de aislamiento (detalle y seguimiento del pedido ajeno) |

Pruebas hechas en la sesión anterior sobre las ramas de cada PR (siguen vigentes: el frontend de pedidos quedó **idéntico** tras el arreglo del PR #27): contra entrega en zona sin permiso (409 sin dejar nada a medias), triple clic en "Confirmar pedido" (un solo pedido y un solo pago), Mercado Pago sin credenciales (pedido creado, 503 en la preferencia, detalle con "Reintentar", sin segundo pedido), "Mis pedidos", detalle, Atrás/Adelante rápido, pedido inexistente e id inválido, cancelar como admin.

## Criterios de aceptación por RF

| RF | Estado | Nota |
|---|---|---|
| RF-030 crear pedido | ✅ | Una transacción: lock del carrito, precio histórico (RN-008), descuento de stock, vaciado del carrito. Backend y checkout |
| RF-031 consultar pedidos | ✅ | Cliente ve solo los suyos (RN-003); paginación y filtros para el personal |
| RF-032 gestionar pedidos | ✅ | Admin y vendedor; solo transiciones válidas; cancelar con reposición |
| RF-033 cancelar por el cliente | ⏭️ v2.0 | RN-010 exige definir la política antes de producción |
| RF-034 pago con Mercado Pago | ⚠️ | Implementado y probado con el SDK **mockeado**. **Nunca probado contra el sandbox real** |
| RF-035/036 webhook y estado del pago | ⚠️ | Firma real del SDK, anti-replay, idempotencia bajo lock; probado con mocks, no con Mercado Pago real |
| RF-037 pago contra entrega | ✅ | Probado de punta a punta; solo en zonas con `permiteContraEntrega` (RN-006) |
| RF-038 consulta del estado de pago | ✅ | |
| RF-027 registro de envío | ✅ | `InfoEnvio` `EN_PREPARACION` al crear el pedido |
| RF-028 seguimiento | ⚠️ Parcial | Estado y fecha de la última actualización; **sin historial** |
| RF-029 actualizar estado de envío | ⚠️ Parcial | Sin registrar el usuario de cada cambio; la notificación al cliente depende de RF-040 (diferido a v2.0) |

## Hallazgos de las revisiones independientes

Cada PR de código pasó una revisión con contexto fresco antes de subirse (los de pagos y pedidos, con el modelo más fuerte). Encontraron problemas reales que los tests del propio autor no veían:

1. **La preferencia de Mercado Pago no incluía el costo de envío** (PR #22): Mercado Pago habría cobrado solo el subtotal y el webhook habría rechazado siempre por monto distinto de `Pedido.total`.
2. **Vencidos contra preferencia vigente** (PR #23): el barrido cancelaba por antigüedad del pedido mientras la preferencia seguía viva; el cliente podía pagar después de cancelado y quedar cobrado sin producto. Ahora la preferencia no vive más que `creadoEn + horas`, un pedido vencido responde 409 y el barrido deja un margen de 15 minutos.
3. **Un rechazo de pago no podía ser final** (PR #22): si el cliente reintentaba con otra tarjeta y pagaba, quedaba cobrado con el pedido rechazado. Política decidida: un rechazo registra el intento, el pedido sigue `PENDIENTE` y no repone stock.
4. **Reembolsos, contracargos y firmas inválidas eran invisibles** (PR #22): ahora dejan logs JSON de reconciliación sin secretos.
5. **Lost update en `registrarAjuste`** (PR #23): un ajuste manual concurrente con un descuento podía pisarlo y sobrevender. Ahora es un UPDATE relativo atómico.
6. **Cancelación por el cliente fuera de alcance** (PR #23): el ERS §2.8.3 la difiere a v2.0; se restringió al personal.
7. **Redirección sin validar a Mercado Pago** (PR #24): ahora exige `https` y host de Mercado Pago o Mercado Libre.
8. **Carrera al cambiar de pedido en el detalle** (PR #24): un `key` por id evita que una carga tardía deje la pantalla cargando.

## Qué funcionó

- Trabajar los cambios de pagos y pedidos con **TDD y pruebas de mutación**: romper a propósito el lock del carrito, la reposición o la guarda de zona hace fallar los tests, o sea que detectan lo que dicen detectar (16 mutaciones detectadas en la fase de pedidos y 10 en la de pagos).
- Hacer cada fase en **PRs encadenados y revisables por partes**, con una revisión independiente antes de subir, y verificar yo mismo la suite sobre una base descartable.
- Merge en vez de rebase para integrar `main` en `sprint-4`, sin reescribir ni un SHA de Melina o Valentina.

## Qué no funcionó / ajustes para Sprint 5

- **`sprint-4` se ramificó de un `main` viejo** (74 commits atrás) y su backend de pagos y pedidos no compilaba: hubo que integrar `main`, resolver el choque de esquema y reescribir gran parte del backend de pagos y pedidos (PR #21 a #23) y el frontend (PR #24 y #25).
- **PR apilado aterrizó en la rama equivocada**: el #24 (frontend, base `sprint-4-pedidos`) se mergeó un segundo después del #23 y, como la rama del #23 todavía no se había borrado, **no se reapuntó a `sprint-4`**; hizo falta un PR de rescate (#25). Para la próxima: mergear el de abajo, esperar a que borre su rama o cambiar la base del de arriba (`gh pr edit --base sprint-4`) y recién entonces mergear el de arriba.
- **Un push directo a `sprint-4` rompió el build**: el commit "archivos restantes sprint-4" agregó 78 líneas pegadas en `Checkout.jsx` y archivos de Sprint 5. Se arregló en el PR #27. Regla a recordar (Plan §2.1): todo entra por Pull Request revisado.
- **Las ramas `sprint-5` y `sprint-5-nuevo` salen del `sprint-4` viejo**: 74 commits atrás de `main`, con el código roto de antes y sin el modelo `Venta` en el esquema; no son una continuación una de la otra y duplican `venta.repository.js`. Hay que unificarlas en una sola rama cortada desde `sprint-4` (o `main` tras mergearlo).
- **Mi propio error**: pedí en un brief que el cliente pudiera cancelar sus pedidos sin verificar el ERS; lo corrigió la revisión independiente.
- **Los permisos de la sesión no permiten leer ni escribir `backend/.env.example`**; lo commiteó el usuario (PR #26). Conviene que el equipo sepa que hay variables nuevas (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_WEBHOOK_URL`, `MERCADOPAGO_PREFERENCIA_HORAS`).
- Desbalance de trabajo: de 47 commits (sin merges), 31 son de una persona y 16 de las otras dos. Repartir las tarjetas de Sprint 5 con responsables explícitos.

## Deuda y puntos abiertos

**Bloquean cerrar Sprint 4**
1. **Mercado Pago real**: probar en sandbox la firma del webhook, el formato de las fechas de expiración, el payload de `refunded`/`charged_back` y la redirección (tarjeta 07-02). Sin esto, RF-034 a RF-036 están verificados solo con mocks.
2. **Historial de envío (RF-028/029)**: requiere una tabla nueva (`HistorialEstadoEnvio`, propuesta en `docs/diseno/info-envio.md` §5) con migración (tarjeta 03-01).

**Decisiones de negocio** (`docs/diseno/pedidos-estados.md` §9)
3. Retención de stock: los pedidos contra entrega nunca vencen, un contra entrega sin pago registrado no se puede confirmar a mano, uno confirmado y rechazado en la puerta no se puede cancelar, y no hay tope de pedidos pendientes por cliente.
4. El stock se descuenta **al crear el pedido** (el DDS §7.2 dice al aprobar el pago); coherente con `pago.service`, pero requiere aprobación explícita.
5. Cancelación por el cliente (RF-033, RN-010).

**Huecos técnicos**
6. La preferencia no define `back_urls` ni `auto_return`: el cliente no vuelve a la tienda desde Mercado Pago (el detalle se refresca a mano y cada 15 s hasta 8 veces).
7. El cliente no sabe si su zona permite contra entrega (propuesta: `/carrito/resumen` devuelve `permiteContraEntrega`); el 503 por pagos sin configurar llega **después** de crear el pedido (validar la configuración antes).
8. Reutilizar la preferencia vigente (`Pago.preferenciaId`) y guardar el historial de intentos; reembolsos y contracargos solo dejan log; no hay scheduler para `POST /pedidos/vencidos/cancelar`.
9. Un vendedor ve todos los pedidos (no existe asignación pedido-vendedor, DDS §6.2); si el cliente edita o borra su dirección después de comprar, cambia la del envío; sin enlaces de navegación a `/admin/pedidos`, `/vendedor/pedidos` ni `/admin/envios` (hoy se entra por URL).
10. Accesibilidad de los componentes comunes (`Input` sin `id`/`aria-*`, `Button` sin `aria-label`, `Modal` sin `role="dialog"`).

## No verificado en esta revisión

- Mercado Pago real (sandbox o producción) en cualquiera de sus partes.
- Lector de pantalla y navegación por teclado.
- El temporizador de 8 s que libera el botón cuando la redirección a Mercado Pago no navega.
- Concurrencia con varias instancias del servidor o con más de dos escritores.
- Los 404 de la consola fueron los esperados de la prueba de aislamiento; se dedujo del patrón de peticiones duplicadas (efecto doble de React en desarrollo), no se contó petición por petición.

## Cierre de rama

El merge de `sprint-4` a `main` va por Pull Request revisado (tarjeta "[Sprint 4 - 10]"). Antes de abrirlo conviene resolver los puntos 1 y 2 de "Deuda" o aceptarlos explícitamente como diferidos. Al mergear: `git tag sprint-4-done` y `git push origin sprint-4-done`.

## Actualización 17/10/2026

RF-028 y RF-029 quedaron cerrados con la tabla `HistorialEstadoEnvio` (historial de estados de envío con usuario, fecha y hora; ver `docs/diseno/info-envio.md` §5). Las menciones de "sin historial" de las secciones anteriores son la foto del momento de la revisión; el texto original no se modificó.
