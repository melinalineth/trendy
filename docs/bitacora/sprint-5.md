# Bitácora Sprint 5

## Fecha
17/10/2026

## Tarjeta
[Sprint 5 - 01] Rama y esquema de datos: Venta (RF-041)

## Trabajo realizado

Se agregó el esquema de datos del registro de ventas (MOD-09, Ventas y reportes). Solo esquema,
migraciones y tests: todavía no hay repository, service, DTO ni rutas de ventas (son las tarjetas 02
a 05), ni frontend.

### Cambios realizados

- Se agregó el enum `EstadoVenta` (`REGISTRADA`, `ANULADA`).
- Se agregó el modelo `Venta`: `pedidoId @unique`, `clienteId`, `responsableId?`, `subtotal`,
  `costoEnvio`, `total` (`Decimal(10,2)`), `metodoPago`, `estado` (default `REGISTRADA`),
  `registradaEn`, `anuladaEn?`, con los índices `(registradaEn)` y `(estado, registradaEn)`.
- Se agregaron las relaciones inversas `Pedido.venta`, `Usuario.ventasComoCliente` y
  `Usuario.ventasGestionadas`. No se modificó nada más del esquema existente (el diff de
  `schema.prisma` son solo adiciones).
- Dos migraciones, en este orden:
  1. `20261017220145_add_venta`: **solo DDL** (tabla, índices y FKs). Su SQL es el que genera
     `prisma migrate diff` entre el schema de `sprint-4` y el actual.
  2. `20261017220200_backfill_ventas`: el `INSERT ... SELECT` del backfill.
- `backend/tests/venta.esquema.test.js` y `limpiar` de `tests/helpers/entorno.js`, que ahora borra
  las ventas antes que pedidos y usuarios (FK sin cascade).

### Por qué dos migraciones

En MySQL el DDL hace commit implícito y Prisma no envuelve el archivo de una migración en una
transacción. Con DDL e `INSERT` en el mismo archivo, un fallo del `INSERT` (p. ej. un lock wait con
un webhook) dejaría la migración a medias: la tabla creada y la migración sin registrar como
aplicada, y el siguiente `migrate deploy` fallaría con "table already exists". Partidas, un fallo del
`INSERT` (una sola sentencia, atómica en InnoDB) no deja ventas a medias y se reintenta con otro
`migrate deploy`. Las migraciones nunca se aplicaron fuera de bases de prueba, por eso se pudieron
reescribir.

### Diseño (RN-008, ERS 4.12)

- `subtotal`, `costoEnvio` y `total` se **copian** del pedido: la venta es historial y no se
  recalcula. Los productos, cantidades y valores por línea **no se duplican**: salen de
  `DetallePedido`.
- `pedidoId @unique` es la garantía, a nivel de base, de que una venta no se registra dos veces.
- Una venta **nunca se borra**. Los tres FK (`pedido`, `cliente`, `responsable`) son `RESTRICT`: no
  se puede borrar un pedido ni un usuario con ventas, aunque la venta esté `ANULADA`. Se eligió
  `RESTRICT` también para `responsable` (la columna sí es opcional) para proteger la historia y la
  atribución: con `SET NULL`, borrar al responsable modificaría la venta en silencio.
- `responsableId` es `NULL` cuando la venta la dispara el webhook de Mercado Pago (no hay usuario) y
  guarda al admin o vendedor en un cambio manual de estado.
- **`ANULADA` es un estado reservado, hoy sin productor** (_actualización: desde la sesión 2 lo
  produce la cancelación de un contra entrega confirmado_). En el flujo vigente ningún pedido con
  venta puede cancelarse: la cancelación solo admite `PENDIENTE` y los legados `PAGO_PENDIENTE` /
  `PAGO_RECHAZADO` (`docs/diseno/pedidos-estados.md` §6), y la venta nace al confirmarse. Cuándo y
  cómo se anula una venta lo define la tarjeta de anulación. Decisión abierta que la condiciona: un
  contra entrega `CONFIRMADO` que el cliente rechaza en la entrega hoy no puede cancelarse
  (`pedidos-estados.md` §9).

## Decisiones

- **Alcance:** RF-043 y RF-044 (reportes) siguen diferidos a v2.0.
- **Visibilidad (decisión del usuario):** en v1.0 el administrador y los vendedores ven **todas** las
  ventas. Las "ventas asignadas" a un vendedor quedan para una versión posterior, por eso no hay
  modelo de asignaciones (mismo criterio que los pedidos, `docs/diseno/pedidos-estados.md` §9).
- **Rama de trabajo:** esta tarjeta sale de `origin/sprint-4` y el trabajo de Sprint 5 se integra en
  una rama `sprint-5-base`, no en `sprint-5`. El nombre `sprint-5` ya lo usa una rama previa de otra
  desarrolladora que no incluye el modelo `Venta` ni la migración de pedidos y sale del `sprint-4`
  anterior. No se tocó `sprint-5` ni `sprint-5-nuevo`. (`sprint-5-base` no la crea esta tarjeta.)

## Backfill de la migración

`backfill_ventas` crea una venta `REGISTRADA` por cada pedido ya confirmado (montos, método de pago y
cliente copiados; `responsableId` NULL):

| Estado del pedido | ¿Genera venta? | Por qué |
| --- | :---: | --- |
| `CONFIRMADO`, `EN_PREPARACION`, `ENVIADO`, `EN_TRANSITO`, `ENTREGADO` | Sí | El pedido ya está confirmado (pago aprobado o contra entrega confirmado) y sigue el ciclo de envío. |
| `PENDIENTE` | No | Todavía no se confirmó. |
| `CANCELADO` | No | Nunca generó venta. |
| `PAGO_APROBADO` | No | Estado de paso: solo avanza a `CONFIRMADO` (`pedidos-estados.md` §3), y ahí nace su venta. Legado: el flujo vigente no lo produce. |
| `PAGO_RECHAZADO`, `PAGO_PENDIENTE` | No | Legados sin pago aprobado. |

La lista coincide con la de la tarjeta; se contrastó con el enum `EstadoPedido` real y con
`docs/diseno/pedidos-estados.md`.

- **`registradaEn = Pedido.creadoEn` es una aproximación documentada**, no la fecha real de la
  venta: para `MERCADO_PAGO` la venta real nace al aprobarse el pago, hasta
  `MERCADOPAGO_PREFERENCIA_HORAS` (24 h por defecto) después de `creadoEn`. El filtro por fecha de
  las ventas backfilleadas es aproximado. (Existen `Pago.actualizadoEn` e `InfoEnvio.actualizadoEn`,
  pero no son la fecha de confirmación; no se usaron.)
- **Corre una sola vez** y no es idempotente a propósito: repetirlo lo rechaza el unique de
  `pedidoId` (no duplica). El `INSERT` es una sola sentencia, atómica en InnoDB: si falla no deja
  ventas a medias (y la migración está partida en dos por eso, ver arriba). Es seguro en una base
  vacía.
- **Hueco entre migrar y tener el servicio:** los pedidos que se confirmen entre la aplicación de la
  migración y la llegada del servicio de ventas **no tendrán venta**, y no hay una re-ejecución
  idempotente del backfill. Es una decisión consciente (el entorno es de desarrollo/staging, sin
  producción). Si hiciera falta, se resuelve con una migración o script puntual.

## Requisitos para las tarjetas de servicio

- La creación de la venta debe engancharse en **toda** transición a `CONFIRMADO`: el webhook de
  Mercado Pago **y** la transición manual `PATCH /pedidos/:id/estado` (contra entrega), incluida la
  salida del legado `PAGO_APROBADO`. Si alguna queda afuera, habrá pedidos confirmados sin venta.
- Debe respetar `pedidoId @unique` (idempotente ante webhooks repetidos, RN-009) y copiar los montos
  del pedido, no recalcularlos.
- `responsableId`: NULL si la dispara el webhook; el usuario si es un cambio manual.
- La anulación (`ANULADA`) queda por definir en su tarjeta (ver "Diseño").

## Verificación

- `prisma validate`, `prisma migrate status` ("al día", 7 migraciones) y `prisma migrate diff`
  del schema contra la base sin diferencias, contra una base de prueba (scratch).
- Suite completa (`npm test`): 519 tests de base + los de `venta.esquema.test.js`, 0 fallos en dos
  corridas. El total sale de la corrida completa, no se deduce de contar los `it(` del archivo.
- Migraciones reales sobre una base con datos (manual, ver abajo): se aplicaron las migraciones
  hasta antes de `add_venta`, se insertaron por SQL pedidos `CONFIRMADO`, `ENTREGADO`, `PENDIENTE` y
  `CANCELADO`, se hizo `migrate deploy` y solo el confirmado y el entregado quedaron con venta, con
  montos, método y fecha copiados y los tres FK en `RESTRICT`.

## No se verificó

- Falla parcial de la migración: está mitigada por la partición en dos archivos, pero no se simuló
  un fallo del `INSERT` a mitad de un `migrate deploy`.
- Locks del `INSERT ... SELECT` sobre una tabla `Pedido` grande o con tráfico (no hay índice por
  estado). En desarrollo/staging no es un problema; habría que revisarlo antes de producción.
- La verificación de las migraciones con datos fue **manual** (bases de prueba, SQL a mano) y no es
  reproducible desde el diff; el test automático solo ejecuta el SQL del backfill sobre pedidos de
  prueba.
- Rendimiento de los índices con datos reales (se verificó que existen, no su uso).
- Pedidos legacy con centavos (`docs/diseno/montos-cop.md`): se copian tal cual a la venta; la regla
  de enteros aplica al pago, no al historial.

---

# Sesión 2: registro y anulación de ventas (RF-041)

## Fecha
17/10/2026

## Tarjetas
[Sprint 5 - 02] [01] Repository de ventas, [02] Service de ventas, [03] Registrar la venta al
aprobarse el pago de Mercado Pago, [04] Registrar y anular la venta al cambiar el estado del pedido
(con su nota del 17/10), y [Sprint 5 - 04] [02] Tests del registro de ventas.

Las tarjetas se escribieron antes del código real de Sprint 4: se tomaron como guía y cuando
contradecían al código ganó el código (rutas de archivos, firmas, `git checkout sprint-5`, que se
ignoró).

## Trabajo realizado

- **Repository** (`venta.repository.js`): se trajo con `cherry-pick` el trabajo de Valentina Ortiz
  (conserva su autoría) y se ajustó en un commit aparte (ver "Defecto corregido").
- **Service** (`venta.service.js`): `registrarVentaDePedido(pedidoId, { responsableId }, tx)` y
  `anularVentaDePedido(pedidoId, { responsableId }, tx)`. Idempotentes; errores con
  `status`/`codigo`/`detalles` (`PEDIDO_NO_ENCONTRADO` 404, `PEDIDO_NO_CONFIRMADO` 409).
- **Webhook de Mercado Pago** (`pago.service.procesarWebhook`): al aprobarse el pago, la venta se
  registra en la misma transacción que confirma el pedido, con `responsableId` NULL.
- **Cambio manual** (`pedido.service.actualizarEstado`): toda transición a `CONFIRMADO` registra la
  venta con el admin/vendedor que la hace, en la misma transacción y bajo el lock existente.
- **Anulación** (`pedido.service.cancelarPedido`, ahora `cancelarPedido(pedidoId, usuario)`; el
  controller pasa `req.usuario`): el personal puede cancelar un pedido **contra entrega**
  confirmado. Repone el stock y anula la venta en la misma transacción. Detalle y tabla de estados
  en `docs/diseno/pedidos-estados.md` §6 y §9.
- **Tests**: `venta.repository.test.js` (16), `venta.service.test.js` (29) y
  `venta.registro.http.test.js` (35).

## Decisiones

- **La venta nace con el pedido confirmado, no con el `Pago` aprobado** (la tarjeta 02 pedía
  dejarlo registrado). Con Mercado Pago es el mismo instante; con contra entrega, cuando el
  personal confirma el pedido, aunque el cobro se registre después con `confirmar-recepcion`.
- **Decisión de producto (del usuario): un pedido contra entrega se puede anular.** Lo siguiente lo
  decidió el desarrollo **dentro de ese marco** y el equipo puede ajustarlo:
  - **Desde qué estados:** `CONFIRMADO`, `EN_PREPARACION`, `ENVIADO` y `EN_TRANSITO`; no desde
    `ENTREGADO`. Se cambia en `ESTADOS_CANCELABLES_CONTRA_ENTREGA` (`pedido.service.js`).
  - **Mercado Pago excluido:** un pedido de Mercado Pago ya pagado no se cancela por esta vía (409
    `PEDIDO_NO_CANCELABLE`, con el motivo del reembolso en el mensaje). El reembolso sigue fuera de
    alcance. Tampoco se cancela un contra entrega con `Pago` `APROBADO` (regla vigente de §7).
  - **Quién:** admin y vendedor (ERS 2.8.3); el cliente sigue con 403.
- **`TRANSICIONES_PEDIDO` no cambió.** `CANCELADO` no se fija por `PATCH /estado` (regla vigente);
  la ampliación está en `ESTADOS_CANCELABLES` / `ESTADOS_CANCELABLES_CONTRA_ENTREGA` / `esCancelable`.
- **`InfoEnvio` y su historial no se tocan al cancelar**: quedan como registro de lo ocurrido. Un
  pedido `CANCELADO` puede mostrar `estadoEnvio: ENVIADO`; el frontend debe priorizar `estadoPedido`.
- **Quién anuló la venta**: `Venta.responsableId` es quien la **registró** y no se pisa; el modelo no
  tiene un campo "anulada por" y no se agregó una migración. Queda en el log JSON `VENTA_ANULADA`,
  que se escribe después de confirmar la transacción. Por eso `anularVentaDePedido` acepta
  `responsableId` pero no lo persiste.
- **Solo `CONFIRMADO` registra la venta en `PATCH /estado`** (no toda transición a un estado de
  `ESTADOS_QUE_CUENTAN`, como decía la tarjeta 02-04). Registrar al avanzar atribuiría al usuario
  equivocado una venta confirmada por otro. A cambio queda un hueco (ver "No se verificó").
- **Cancelar vencidos no cambia**: solo cancela `PENDIENTE`, que nunca tuvo venta (test incluido).

## Defecto corregido en el repository de Ortiz

Se dejó su lógica y se corrigió una sola cosa, con test que fallaba antes: dentro de una transacción
InnoDB (REPEATABLE READ) una lectura común devuelve la **foto** de la primera lectura. Con
`findUnique`, `obtenerPedidoParaVenta` podía leer un estado viejo del pedido, y la relectura tras un
`P2002` (la que la tarjeta 02-02 da por válida "dentro del mismo tx") no veía la venta que otro
acababa de confirmar y habría propagado el error. Ahora `obtenerPedidoParaVenta` lee con
`SELECT ... FOR UPDATE` (re-tomar el lock del pedido ya tomado no cuesta nada) y `buscarPorPedido`
acepta `{ bloquear: true }` para la relectura. Además: cabecera de documentación y `responsableId`
con default `null`.

## Verificación

- `prisma validate` y `prisma migrate status` ("al día", 8 migraciones, base scratch). No hay
  cambios de esquema ni migraciones nuevas.
- Suite completa dos veces: **651 tests, 0 fallos** (571 de base + 80 nuevos).
- Mutaciones temporales (revertidas, no commiteadas) para comprobar que los tests detectan el
  defecto: (1) relectura del `P2002` sin lock -> falla el test de foto vieja; (2) `esUniqueDePedido`
  siempre `false` -> fallan 3 tests de concurrencia; (3) registro de la venta fuera de la
  transacción en `PATCH /estado` -> falla el test de atomicidad; (4) error del registro atrapado en
  el webhook -> falla el test de atomicidad del webhook; (5) anulación de la venta fuera de la
  transacción de cancelación -> falla el test de atomicidad de la cancelación.

## No se verificó

- **Mercado Pago real**: el SDK está mockeado (como en el resto de los tests); falta la prueba en
  sandbox (tarjeta [Sprint 5 - 07] [04]).
- **Pedidos confirmados sin venta** (confirmados entre la migración y este servicio, o datos
  cargados a mano): al avanzar de estado no la obtienen; habría que registrarla con un script
  puntual (ver `pedidos-estados.md` §9).
- **Carga real**: la concurrencia se probó con 4 a 6 solicitudes simultáneas, no bajo carga.
- **Reposición desde `ENVIADO` / `EN_TRANSITO`**: se asume que la mercadería vuelve; es una
  decisión de negocio sin confirmar.
- **Frontend**: nada de esto se mostró en pantalla; el consumo de `estadoPedido: CANCELADO` con
  `estadoEnvio` distinto de `EN_PREPARACION` queda para la tarjeta de frontend.
- Endpoints de consulta de ventas (`GET /api/v1/ventas`): son el siguiente PR.
