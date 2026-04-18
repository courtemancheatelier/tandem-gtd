-- AlterTable
ALTER TABLE "User" ADD COLUMN "cascade_event_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "last_what_now_at" TIMESTAMP(3);
