-- AlterTable
ALTER TABLE "Project" ADD COLUMN "threadsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Project" ADD COLUMN "decisionsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Project" ADD COLUMN "completionNotesEnabled" BOOLEAN NOT NULL DEFAULT true;
