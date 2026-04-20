-- AlterTable: Add email inbox capture fields to User
ALTER TABLE "User" ADD COLUMN "emailInboxToken" TEXT;
ALTER TABLE "User" ADD COLUMN "emailInboxEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: Unique index on emailInboxToken
CREATE UNIQUE INDEX "User_emailInboxToken_key" ON "User"("emailInboxToken");

-- AlterTable: Add source tracking fields to InboxItem
ALTER TABLE "InboxItem" ADD COLUMN "source" TEXT;
ALTER TABLE "InboxItem" ADD COLUMN "sourceEmail" TEXT;
