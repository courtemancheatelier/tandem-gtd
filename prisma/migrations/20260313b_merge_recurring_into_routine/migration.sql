-- Phase 1: Add RecurringTemplate fields to HealthProtocol (Routine)
ALTER TABLE "HealthProtocol" ADD COLUMN "target_time" TEXT;
ALTER TABLE "HealthProtocol" ADD COLUMN "due_by_time" TEXT;
ALTER TABLE "HealthProtocol" ADD COLUMN "skip_streak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HealthProtocol" ADD COLUMN "task_defaults" JSONB;
ALTER TABLE "HealthProtocol" ADD COLUMN "goal_id" TEXT;
ALTER TABLE "HealthProtocol" ADD COLUMN "progression_base_value" INTEGER;
ALTER TABLE "HealthProtocol" ADD COLUMN "progression_increment" INTEGER;
ALTER TABLE "HealthProtocol" ADD COLUMN "progression_unit" TEXT;
ALTER TABLE "HealthProtocol" ADD COLUMN "progression_frequency" TEXT;
ALTER TABLE "HealthProtocol" ADD COLUMN "progression_start_date" TIMESTAMP(3);

-- Add FK constraint for goal
ALTER TABLE "HealthProtocol" ADD CONSTRAINT "HealthProtocol_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate RecurringTemplate data into HealthProtocol as simple routines (no windows)
INSERT INTO "HealthProtocol" (
  "id", "title", "description", "cron_expression", "is_active",
  "last_generated", "next_due", "color", "estimated_mins",
  "protocol_type", "target_time", "due_by_time", "skip_streak",
  "task_defaults", "goal_id",
  "progression_base_value", "progression_increment", "progression_unit",
  "progression_frequency", "progression_start_date",
  "createdAt", "updatedAt", "userId", "areaId"
)
SELECT
  id, title, description, "cronExpression", "isActive",
  "lastGenerated", "nextDue", color, "estimatedMins",
  'static', "targetTime", "dueByTime", "skipStreak",
  "taskDefaults", "goalId",
  "progression_base_value", "progression_increment", "progression_unit",
  "progression_frequency", "progression_start_date",
  "createdAt", "updatedAt", "userId", "areaId"
FROM "RecurringTemplate";

-- Point tasks from RecurringTemplate to their new Routine row (same ID)
UPDATE "Task"
SET "healthProtocolId" = "recurringTemplateId"
WHERE "recurringTemplateId" IS NOT NULL;

-- Clear the old FK (but don't drop column yet — safety net)
UPDATE "Task" SET "recurringTemplateId" = NULL
WHERE "recurringTemplateId" IS NOT NULL;
