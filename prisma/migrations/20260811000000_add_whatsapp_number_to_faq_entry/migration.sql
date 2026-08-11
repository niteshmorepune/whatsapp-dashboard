-- AlterTable
ALTER TABLE `FaqEntry` ADD COLUMN `whatsappNumberId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `FaqEntry_whatsappNumberId_idx` ON `FaqEntry`(`whatsappNumberId`);

-- AddForeignKey
ALTER TABLE `FaqEntry` ADD CONSTRAINT `FaqEntry_whatsappNumberId_fkey` FOREIGN KEY (`whatsappNumberId`) REFERENCES `WhatsappNumber`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
