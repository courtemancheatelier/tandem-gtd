-- Add itemsTaken field to HealthLog for partial completion tracking
ALTER TABLE "HealthLog" ADD COLUMN "items_taken" JSONB;
