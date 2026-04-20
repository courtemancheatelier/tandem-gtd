-- AlterTable
ALTER TABLE "User" ADD COLUMN "hidden_features" TEXT;

-- AlterTable
ALTER TABLE "ServerSettings" ADD COLUMN "disabled_features" TEXT;
