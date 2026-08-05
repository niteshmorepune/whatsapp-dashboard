-- AlterTable
ALTER TABLE `conversation` ADD COLUMN `aiMuted` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `message` ADD COLUMN `sentByAi` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `whatsappnumber` ADD COLUMN `aiMode` ENUM('AUTO', 'FORCE_ON', 'FORCE_OFF') NOT NULL DEFAULT 'AUTO',
    ADD COLUMN `businessHours` JSON NULL;

-- CreateTable
CREATE TABLE `Holiday` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Holiday_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FaqEntry` (
    `id` VARCHAR(191) NOT NULL,
    `question` TEXT NOT NULL,
    `answer` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
