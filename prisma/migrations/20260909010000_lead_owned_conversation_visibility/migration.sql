-- AlterTable
ALTER TABLE `ConversationAssignee` ADD COLUMN `crmManaged` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `WhatsappNumber` ADD COLUMN `restrictToOwnLeads` BOOLEAN NOT NULL DEFAULT false;
