-- Sprint 2 / Ronda 4 (MOD-03, RF-017): agrega InventarioMovimiento, que
-- registra cada alta/ajuste de stock por variante (RN-002: el stock nunca
-- queda negativo, validado en inventario.repository.js antes de escribir
-- acá, no a nivel de constraint SQL). Sin fragmento textual del DDS para
-- este modelo (a diferencia de Producto/Variante en la migración de
-- Ronda 1) — ver el comentario en schema.prisma con el detalle de cada
-- campo.
-- Escrita a mano porque no hay una base MySQL viva disponible en este
-- entorno para que `prisma migrate dev` la genere; sigue el mismo estilo
-- que las migraciones `20260917145452_init` y
-- `20260926000001_add_catalogo_categoria_producto_variante_imagen`.

-- CreateTable
CREATE TABLE `InventarioMovimiento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `varianteId` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `tipoAjuste` VARCHAR(191) NOT NULL,
    `motivo` VARCHAR(191) NULL,
    `usuarioId` INTEGER NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `InventarioMovimiento` ADD CONSTRAINT `InventarioMovimiento_varianteId_fkey` FOREIGN KEY (`varianteId`) REFERENCES `Variante`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventarioMovimiento` ADD CONSTRAINT `InventarioMovimiento_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
