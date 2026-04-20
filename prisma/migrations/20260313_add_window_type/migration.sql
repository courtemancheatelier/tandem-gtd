-- AlterTable
ALTER TABLE "HealthWindow" ADD COLUMN "window_type" TEXT NOT NULL DEFAULT 'general';

-- Backfill existing windows as health type
UPDATE "HealthWindow" SET "window_type" = 'health' WHERE "window_type" = 'general';
