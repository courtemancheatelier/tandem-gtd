-- Add time-of-day scheduling to recurring templates
ALTER TABLE "RecurringTemplate" ADD COLUMN "targetTime" TEXT;
ALTER TABLE "RecurringTemplate" ADD COLUMN "dueByTime" TEXT;
