-- Deleting a Contact with any conversation history (i.e. almost any real
-- contact) previously failed outright with a foreign-key constraint
-- violation, since Conversation/Message/BroadcastRecipient had no cascade
-- back to Contact. The DELETE /api/contacts/[id] route swallowed that error
-- into a generic "Failed to delete contact" toast with no detail. This
-- migration makes deleting a Contact actually cascade-delete their
-- conversations, messages, and broadcast-recipient rows.

-- DropForeignKey
ALTER TABLE `Conversation` DROP FOREIGN KEY `Conversation_contactId_fkey`;

-- DropForeignKey
ALTER TABLE `Message` DROP FOREIGN KEY `Message_conversationId_fkey`;

-- DropForeignKey
ALTER TABLE `BroadcastRecipient` DROP FOREIGN KEY `BroadcastRecipient_contactId_fkey`;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BroadcastRecipient` ADD CONSTRAINT `BroadcastRecipient_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
