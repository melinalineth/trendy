-- AlterTable
ALTER TABLE `Venta` ADD COLUMN `anuladaPorId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Venta` ADD CONSTRAINT `Venta_anuladaPorId_fkey` FOREIGN KEY (`anuladaPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
