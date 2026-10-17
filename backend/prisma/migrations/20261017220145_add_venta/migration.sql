-- Sprint 5 (RF-041, RN-008, ERS 4.12): registro de ventas. Agrega la tabla Venta
-- (una por pedido, pedidoId UNIQUE) y su estado (REGISTRADA / ANULADA como ENUM
-- de columna), con sus índices y FKs (los tres RESTRICT). SOLO DDL, generado con
-- `prisma migrate diff` desde el schema de sprint-4: no modifica tablas
-- existentes. El backfill de ventas va aparte, en la migración siguiente
-- (backfill_ventas): en MySQL el DDL hace commit implícito y Prisma no envuelve
-- el archivo en una transacción, así que mezclarlos dejaría la migración a
-- medias si el INSERT fallara.

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
ALTER TABLE `Venta` ADD CONSTRAINT `Venta_responsableId_fkey` FOREIGN KEY (`responsableId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
