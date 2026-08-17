-- AlterTable
ALTER TABLE `Template` ADD COLUMN `hasButtonParam` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Broadcast` ADD COLUMN `buttonUrlParam` VARCHAR(191) NULL;
