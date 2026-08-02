-- AlterTable
ALTER TABLE `broadcast` ADD COLUMN `whatsappNumberId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `conversation` ADD COLUMN `whatsappNumberId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `WhatsappNumber` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `businessNumber` VARCHAR(191) NOT NULL,
    `phoneNumberId` VARCHAR(191) NOT NULL,
    `wabaId` VARCHAR(191) NOT NULL,
    `accessToken` TEXT NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WhatsappNumber_businessNumber_key`(`businessNumber`),
    UNIQUE INDEX `WhatsappNumber_phoneNumberId_key`(`phoneNumberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentWhatsappNumber` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `whatsappNumberId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AgentWhatsappNumber_whatsappNumberId_idx`(`whatsappNumberId`),
    UNIQUE INDEX `AgentWhatsappNumber_agentId_whatsappNumberId_key`(`agentId`, `whatsappNumberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Broadcast_whatsappNumberId_idx` ON `Broadcast`(`whatsappNumberId`);

-- CreateIndex
CREATE INDEX `Conversation_whatsappNumberId_idx` ON `Conversation`(`whatsappNumberId`);

-- AddForeignKey
ALTER TABLE `AgentWhatsappNumber` ADD CONSTRAINT `AgentWhatsappNumber_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentWhatsappNumber` ADD CONSTRAINT `AgentWhatsappNumber_whatsappNumberId_fkey` FOREIGN KEY (`whatsappNumberId`) REFERENCES `WhatsappNumber`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_whatsappNumberId_fkey` FOREIGN KEY (`whatsappNumberId`) REFERENCES `WhatsappNumber`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Broadcast` ADD CONSTRAINT `Broadcast_whatsappNumberId_fkey` FOREIGN KEY (`whatsappNumberId`) REFERENCES `WhatsappNumber`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
