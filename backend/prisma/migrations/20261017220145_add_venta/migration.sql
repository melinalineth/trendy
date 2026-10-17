-- Sprint 5 (RF-041, RN-008, ERS 4.12): registro de ventas. Agrega la tabla Venta
-- (una por pedido, pedidoId UNIQUE) y el enum de estado (REGISTRADA / ANULADA
-- como ENUM de columna). Generada con `prisma migrate dev --create-only`; solo
-- se agregó el backfill del final. No modifica tablas existentes.

-- CreateTable
CREATE TABLE `Venta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` INTEGER NOT NULL,
    `clienteId` INTEGER NOT NULL,
    `responsableId` INTEGER NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `costoEnvio` DECIMAL(10, 2) NOT NULL,
    `total` DECIMAL(10, 2) NOT NULL,
    `metodoPago` ENUM('MERCADO_PAGO', 'CONTRA_ENTREGA') NOT NULL,
    `estado` ENUM('REGISTRADA', 'ANULADA') NOT NULL DEFAULT 'REGISTRADA',
    `registradaEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `anuladaEn` DATETIME(3) NULL,

    UNIQUE INDEX `Venta_pedidoId_key`(`pedidoId`),
    INDEX `Venta_registradaEn_idx`(`registradaEn`),
    INDEX `Venta_estado_registradaEn_idx`(`estado`, `registradaEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Venta` ADD CONSTRAINT `Venta_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `Pedido`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Venta` ADD CONSTRAINT `Venta_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Venta` ADD CONSTRAINT `Venta_responsableId_fkey` FOREIGN KEY (`responsableId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: una venta REGISTRADA por cada pedido que ya estaba confirmado, con
-- los montos, el método de pago, el cliente y la fecha COPIADOS del pedido
-- (registradaEn = Pedido.creadoEn: es la única fecha que hay). Estados que
-- cuentan como confirmados: CONFIRMADO, EN_PREPARACION, ENVIADO, EN_TRANSITO y
-- ENTREGADO. Quedan afuera PENDIENTE y CANCELADO (nunca generaron venta) y los
-- estados de pago PAGO_APROBADO, PAGO_RECHAZADO y PAGO_PENDIENTE (legados: el
-- flujo vigente no los produce; un PAGO_APROBADO pasa a CONFIRMADO y ahí nace su
-- venta). responsableId queda NULL (no se sabe quién confirmó). Corre UNA sola
-- vez, dentro de esta migración, y NO es idempotente a propósito: si se
-- repitiera, el UNIQUE de pedidoId lo rechazaría en lugar de duplicar ventas.
-- Es seguro en una base vacía (no inserta nada).
INSERT INTO `Venta` (`pedidoId`, `clienteId`, `subtotal`, `costoEnvio`, `total`, `metodoPago`, `estado`, `registradaEn`)
SELECT `id`, `usuarioId`, `subtotal`, `costoEnvio`, `total`, `metodoPago`, 'REGISTRADA', `creadoEn`
FROM `Pedido`
WHERE `estado` IN ('CONFIRMADO', 'EN_PREPARACION', 'ENVIADO', 'EN_TRANSITO', 'ENTREGADO');
