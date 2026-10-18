-- CreateTable
CREATE TABLE `HistorialEstadoEnvio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `infoEnvioId` INTEGER NOT NULL,
    `estadoAnterior` ENUM('EN_PREPARACION', 'ENVIADO', 'EN_TRANSITO', 'ENTREGADO') NULL,
    `estadoNuevo` ENUM('EN_PREPARACION', 'ENVIADO', 'EN_TRANSITO', 'ENTREGADO') NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HistorialEstadoEnvio_infoEnvioId_creadoEn_idx`(`infoEnvioId`, `creadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `HistorialEstadoEnvio` ADD CONSTRAINT `HistorialEstadoEnvio_infoEnvioId_fkey` FOREIGN KEY (`infoEnvioId`) REFERENCES `InfoEnvio`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistorialEstadoEnvio` ADD CONSTRAINT `HistorialEstadoEnvio_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

