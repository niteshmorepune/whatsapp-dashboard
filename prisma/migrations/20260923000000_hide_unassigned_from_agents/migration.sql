-- Marketing-line strict visibility: unclaimed conversations become
-- ADMIN-only when set. Default false leaves every existing line unchanged.
ALTER TABLE `WhatsappNumber` ADD COLUMN `hideUnassignedFromAgents` BOOLEAN NOT NULL DEFAULT false;
