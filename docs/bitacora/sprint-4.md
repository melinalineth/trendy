# Bitácora Sprint 4

## Fecha
02/10/2026

## Trabajo realizado

Se amplió el modelo de datos de Trendy para soportar el flujo de pedidos,
detalles de pedido, pagos e información de envío.

### Cambios realizados

- Se agregó el modelo `Pedido`.
- Se agregó el modelo `DetallePedido`.
- Se agregó el modelo `Pago`.
- Se agregó el modelo `InfoEnvio`.
- Se agregaron los enums:
  - `EstadoPedido`
  - `MetodoPago`
  - `EstadoPago`
  - `EstadoEnvio`
- Se agregaron las relaciones inversas entre:
  - `Usuario` y `Pedido`
  - `Variante` y `DetallePedido`
  - `Direccion` y `Pedido`
  - `Direccion` y `InfoEnvio`
- Se agregó `permiteContraEntrega` a `ZonaCobertura`.
- `Pago` e `InfoEnvio` utilizan `pedidoId @unique` para mantener una relación 1:1 con `Pedido`.
- `DetallePedido.precioUnitario` conserva el precio utilizado en el momento de la compra.

## Regla histórica de precios

El precio del detalle del pedido se almacena en `precioUnitario`.
El historial del pedido no debe depender del precio actual de `Producto`.

## Migración

Se generará una migración de Prisma para aplicar los cambios a la base de datos.