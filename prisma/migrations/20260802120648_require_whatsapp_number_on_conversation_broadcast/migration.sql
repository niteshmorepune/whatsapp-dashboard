/*
  Warnings:

  - Made the column `whatsappNumberId` on table `broadcast` required. This step will fail if there are existing NULL values in that column.
  - Made the column `whatsappNumberId` on table `conversation` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `Broadcast` DROP FOREIGN KEY `Broadcast_whatsappNumberId_fkey`;

-- DropForeignKey
ALTER TABLE `Conversation` DROP FOREIGN KEY `Conversation_whatsappNumberId_fkey`;

-- AlterTable
ALTER TABLE `Broadcast` MODIFY `whatsappNumberId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Conversation` MODIFY `whatsappNumberId` VARCHAR(191) NOT NULL;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_whatsappNumberId_fkey` FOREIGN KEY (`whatsappNumberId`) REFERENCES `WhatsappNumber`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Broadcast` ADD CONSTRAINT `Broadcast_whatsappNumberId_fkey` FOREIGN KEY (`whatsappNumberId`) REFERENCES `WhatsappNumber`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
