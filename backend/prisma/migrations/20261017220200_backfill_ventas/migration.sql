-- Sprint 5 (RF-041): backfill de ventas. Una venta REGISTRADA por cada pedido que
-- ya estaba confirmado, con los montos, el método de pago y el cliente COPIADOS
-- del pedido. Estados que cuentan como confirmados: CONFIRMADO, EN_PREPARACION,
-- ENVIADO, EN_TRANSITO y ENTREGADO. Quedan afuera PENDIENTE y CANCELADO (nunca
-- generaron venta) y los estados de pago PAGO_APROBADO, PAGO_RECHAZADO y
-- PAGO_PENDIENTE (legados: el flujo vigente no los produce; un PAGO_APROBADO
-- pasa a CONFIRMADO y ahí nace su venta).
-- registradaEn = Pedido.creadoEn es una APROXIMACIÓN documentada: para
-- MERCADO_PAGO la venta real nace al aprobarse el pago, hasta
-- MERCADOPAGO_PREFERENCIA_HORAS (24 h por defecto) después de creadoEn, así que
-- el filtro por fecha de las ventas backfilleadas es aproximado.
-- responsableId queda NULL (no se sabe quién confirmó).
-- Va en su propia migración, separada del DDL: es una sola sentencia INSERT
-- (atómica en InnoDB), así que si falla no deja ventas a medias y el
-- `migrate deploy` se puede reintentar. Corre UNA sola vez y NO es idempotente
-- a propósito: si se repitiera, el UNIQUE de pedidoId lo rechazaría en lugar de
-- duplicar ventas. Es seguro en una base vacía (no inserta nada).
INSERT INTO `Venta` (`pedidoId`, `clienteId`, `subtotal`, `costoEnvio`, `total`, `metodoPago`, `estado`, `registradaEn`)
SELECT `id`, `usuarioId`, `subtotal`, `costoEnvio`, `total`, `metodoPago`, 'REGISTRADA', `creadoEn`
FROM `Pedido`
WHERE `estado` IN ('CONFIRMADO', 'EN_PREPARACION', 'ENVIADO', 'EN_TRANSITO', 'ENTREGADO');
