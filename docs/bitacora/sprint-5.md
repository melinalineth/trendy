# Bitácora Sprint 5

## Fecha
17/10/2026

## Tarjeta
[Sprint 5 - 01] Rama y esquema de datos: Venta (RF-041)

## Trabajo realizado

Se agregó el esquema de datos del registro de ventas. Solo esquema, migración y tests: todavía no
hay repository, service, DTO ni rutas de ventas (son las tarjetas 02 a 05), ni frontend.

### Cambios realizados

- Se agregó el enum `EstadoVenta` (`REGISTRADA`, `ANULADA`).
- Se agregó el modelo `Venta`: `pedidoId @unique`, `clienteId`, `responsableId?`, `subtotal`,
  `costoEnvio`, `total` (`Decimal(10,2)`), `metodoPago`, `estado` (default `REGISTRADA`),
  `registradaEn`, `anuladaEn?`, con los índices `(registradaEn)` y `(estado, registradaEn)`.
- Se agregaron las relaciones inversas `Pedido.venta`, `Usuario.ventasComoCliente` y
  `Usuario.ventasGestionadas`. No se modificó nada más del esquema existente (el diff de
  `schema.prisma` son solo adiciones).
- Migración `20261017220145_add_venta` (generada con `prisma migrate dev --create-only`, más el
  backfill escrito a mano al final).
- `backend/tests/venta.esquema.test.js` (14 tests) y `limpiar` de `tests/helpers/entorno.js`, que
  ahora borra las ventas antes que pedidos y usuarios (FK sin cascade).

### Diseño (RN-008, ERS 4.12)

- `subtotal`, `costoEnvio` y `total` se **copian** del pedido: la venta es historial y no se
  recalcula. Los productos, cantidades y valores por línea **no se duplican**: salen de
  `DetallePedido`.
- `pedidoId @unique` es la garantía, a nivel de base, de que una venta no se registra dos veces.
- Una venta de un pedido cancelado pasa a `ANULADA` (con `anuladaEn`), **nunca se borra**. Los FK a
  `Pedido` y a `Usuario` (cliente) son `RESTRICT`: no se puede borrar un pedido ni un cliente con
  ventas, ni siquiera si la venta está anulada.
- `responsableId` es `NULL` cuando la venta la dispara el webhook de Mercado Pago (no hay usuario) y
  guarda al admin o vendedor en un cambio manual de estado. Al ser opcional, Prisma le pone
  `ON DELETE SET NULL` por defecto (borrar al responsable deja la venta con `responsableId` NULL).
  Los usuarios no se borran en la app (pasan a `INACTIVO`), por eso no se endureció.

## Decisiones

- **Alcance:** RF-043 y RF-044 (reportes) siguen diferidos a v2.0.
- **Visibilidad (decisión del usuario):** en v1.0 el administrador y los vendedores ven **todas** las
  ventas. Las "ventas asignadas" a un vendedor quedan para una versión posterior, por eso no hay
  modelo de asignaciones (mismo criterio que los pedidos, `docs/diseno/pedidos-estados.md` §9).
- **Rama de trabajo:** esta tarjeta sale de `origin/sprint-4` y el trabajo de Sprint 5 se integra en
  una rama `sprint-5-base`, no en `sprint-5`. El nombre `sprint-5` ya está ocupado por una rama
  previa de otra desarrolladora que sale del `sprint-4` viejo y no carga. No se tocó `sprint-5` ni
  `sprint-5-nuevo`. (`sprint-5-base` no la creó esta tarjeta: la crea quien arma el flujo de PRs.)

## Backfill de la migración

La migración crea una venta `REGISTRADA` por cada pedido ya confirmado (montos, método de pago,
cliente copiados; `registradaEn = Pedido.creadoEn`; `responsableId` NULL):

| Estado del pedido | ¿Genera venta? | Por qué |
| --- | :---: | --- |
| `CONFIRMADO`, `EN_PREPARACION`, `ENVIADO`, `EN_TRANSITO`, `ENTREGADO` | Sí | El pedido ya está confirmado (pago aprobado o contra entrega confirmado) y sigue el ciclo de envío. |
| `PENDIENTE` | No | Todavía no se confirmó. |
| `CANCELADO` | No | Nunca generó venta (las ventas anuladas son las de pedidos que se cancelan *después* de tener venta). |
| `PAGO_APROBADO` | No | Estado de paso: solo avanza a `CONFIRMADO` (`pedidos-estados.md` §3), y ahí nace su venta. Legado: el flujo vigente no lo produce. |
| `PAGO_RECHAZADO`, `PAGO_PENDIENTE` | No | Legados sin pago aprobado. |

La lista coincide con la de la tarjeta; se contrastó con el enum `EstadoPedido` real y con
`docs/diseno/pedidos-estados.md`. El backfill corre **una sola vez**, dentro de la migración, y no
es idempotente a propósito: repetirlo lo rechaza el unique de `pedidoId` (no duplica). Es seguro en
una base vacía.

## Verificación

- `prisma validate` y `prisma migrate status` ("al día") contra una base scratch.
- Suite completa: 519 tests de base + 14 nuevos, 0 fallos (dos corridas).
- Migración real sobre una base con datos (scratch aparte): se aplicaron las migraciones hasta antes
  de `add_venta`, se insertaron por SQL pedidos `CONFIRMADO`, `ENTREGADO`, `PENDIENTE` y
  `CANCELADO`, se hizo `migrate deploy` y solo el confirmado y el entregado quedaron con venta, con
  montos, método y fecha copiados.

## No se verificó

- La migración contra una base de producción o con un volumen real de pedidos (solo bases scratch).
- Rendimiento de los índices con datos reales (se verificó que existen, no su uso por el optimizador).
- Los pedidos creados antes del cambio de pesos enteros (`montos-cop.md`) con centavos: se copian tal
  cual a la venta; la regla de enteros aplica al pago, no al historial.
