-- Sprint 3 (MOD-04 y MOD-05, RF-018, RF-021): agrega Carrito, ItemCarrito,
-- ZonaCobertura y TarifaEnvio. ItemCarrito se borra en cascada con su Carrito
-- y tiene unique (carritoId, varianteId); ZonaCobertura y TarifaEnvio usan
-- `estado` ENUM('ACTIVO', 'INACTIVO') (el enum EstadoProducto, igual que
-- Categoria).
-- Generada sin base MySQL viva con `prisma migrate diff --from-schema` (el
-- schema de main) `--to-schema` (el schema actual) `--script`; sigue el mismo
-- estilo que las migraciones `20260917145452_init` y
-- `20260926000001_add_catalogo_categoria_producto_variante_imagen`.

-- CreateTable
CREATE TABLE `Carrito` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuarioId` INTEGER NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Carrito_usuarioId_key`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ItemCarrito` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carritoId` INTEGER NOT NULL,
    `varianteId` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,

    INDEX `ItemCarrito_carritoId_idx`(`carritoId`),
    INDEX `ItemCarrito_varianteId_idx`(`varianteId`),
    UNIQUE INDEX `ItemCarrito_carritoId_varianteId_key`(`carritoId`, `varianteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ZonaCobertura` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `departamento` VARCHAR(191) NOT NULL,
    `ciudad` VARCHAR(191) NOT NULL,
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',

    INDEX `ZonaCobertura_departamento_ciudad_idx`(`departamento`, `ciudad`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TarifaEnvio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `zonaCoberturaId` INTEGER NOT NULL,
    `costo` DECIMAL(10, 2) NOT NULL,
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',

    INDEX `TarifaEnvio_zonaCoberturaId_idx`(`zonaCoberturaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Carrito` ADD CONSTRAINT `Carrito_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemCarrito` ADD CONSTRAINT `ItemCarrito_carritoId_fkey` FOREIGN KEY (`carritoId`) REFERENCES `Carrito`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemCarrito` ADD CONSTRAINT `ItemCarrito_varianteId_fkey` FOREIGN KEY (`varianteId`) REFERENCES `Variante`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TarifaEnvio` ADD CONSTRAINT `TarifaEnvio_zonaCoberturaId_fkey` FOREIGN KEY (`zonaCoberturaId`) REFERENCES `ZonaCobertura`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
