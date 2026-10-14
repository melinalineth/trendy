-- Sprint 4 (RF-030 a RF-038): agrega Pedido, DetallePedido, Pago e InfoEnvio
-- con sus enums (EstadoPedido, MetodoPago, EstadoPago, EstadoEnvio como ENUM
-- de columna) y la columna ZonaCobertura.permiteContraEntrega (RF-037,
-- default false). Generada con `prisma migrate diff` desde el schema de main
-- (Sprint 3) hacia el schema integrado; no modifica tablas de Sprint 3 salvo
-- agregar esa columna.

-- AlterTable
ALTER TABLE `ZonaCobertura` ADD COLUMN `permiteContraEntrega` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `Pedido` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `numero` VARCHAR(191) NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `costoEnvio` DECIMAL(10, 2) NOT NULL,
    `total` DECIMAL(10, 2) NOT NULL,
    `estado` ENUM('PENDIENTE', 'PAGO_APROBADO', 'CONFIRMADO', 'EN_PREPARACION', 'ENVIADO', 'EN_TRANSITO', 'ENTREGADO', 'CANCELADO', 'PAGO_RECHAZADO', 'PAGO_PENDIENTE') NOT NULL DEFAULT 'PENDIENTE',
    `metodoPago` ENUM('MERCADO_PAGO', 'CONTRA_ENTREGA') NOT NULL,
    `direccionId` INTEGER NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Pedido_numero_key`(`numero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DetallePedido` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` INTEGER NOT NULL,
    `varianteId` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `precioUnitario` DECIMAL(10, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Pago` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` INTEGER NOT NULL,
    `metodo` ENUM('MERCADO_PAGO', 'CONTRA_ENTREGA') NOT NULL,
    `estado` ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO', 'CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
    `referenciaExterna` VARCHAR(191) NULL,
    `monto` DECIMAL(10, 2) NOT NULL,
    `actualizadoEn` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Pago_pedidoId_key`(`pedidoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InfoEnvio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` INTEGER NOT NULL,
    `direccionId` INTEGER NOT NULL,
    `costoEnvio` DECIMAL(10, 2) NOT NULL,
    `estadoEnvio` ENUM('EN_PREPARACION', 'ENVIADO', 'EN_TRANSITO', 'ENTREGADO') NOT NULL,
    `actualizadoEn` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InfoEnvio_pedidoId_key`(`pedidoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Pedido` ADD CONSTRAINT `Pedido_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pedido` ADD CONSTRAINT `Pedido_direccionId_fkey` FOREIGN KEY (`direccionId`) REFERENCES `Direccion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DetallePedido` ADD CONSTRAINT `DetallePedido_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `Pedido`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DetallePedido` ADD CONSTRAINT `DetallePedido_varianteId_fkey` FOREIGN KEY (`varianteId`) REFERENCES `Variante`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pago` ADD CONSTRAINT `Pago_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `Pedido`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InfoEnvio` ADD CONSTRAINT `InfoEnvio_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `Pedido`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InfoEnvio` ADD CONSTRAINT `InfoEnvio_direccionId_fkey` FOREIGN KEY (`direccionId`) REFERENCES `Direccion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

