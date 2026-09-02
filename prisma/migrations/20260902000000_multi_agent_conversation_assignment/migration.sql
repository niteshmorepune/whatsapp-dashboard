-- CreateTable
CREATE TABLE `ConversationAssignee` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ConversationAssignee_conversationId_idx`(`conversationId`),
    INDEX `ConversationAssignee_agentId_idx`(`agentId`),
    UNIQUE INDEX `ConversationAssignee_conversationId_agentId_key`(`conversationId`, `agentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ConversationAssignee` ADD CONSTRAINT `ConversationAssignee_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConversationAssignee` ADD CONSTRAINT `ConversationAssignee_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: preserve every existing single assignment as a row in the new
-- join table BEFORE the old column is dropped below, so no assignment is
-- silently lost.
INSERT INTO `ConversationAssignee` (`id`, `conversationId`, `agentId`, `createdAt`)
SELECT UUID(), `id`, `agentId`, NOW(3)
FROM `Conversation`
WHERE `agentId` IS NOT NULL;

-- DropForeignKey
-- NOTE: table name normalized to `Conversation` (PascalCase, matching the
-- Prisma model's real un-mapped name) — `prisma migrate diff` generated
-- this against `conversation` (lowercase) because the local dev MySQL is
-- case-insensitive (lower_case_table_names=1, a common Windows default);
-- production Linux MySQL is case-sensitive and would fail to find the
-- table under the wrong case. See feedback-gotchas memory, hit once
-- already in this exact repo on 2026-08-23.
ALTER TABLE `Conversation` DROP FOREIGN KEY `Conversation_agentId_fkey`;

-- AlterTable
ALTER TABLE `Conversation` DROP COLUMN `agentId`;
