-- Drop RecurringTemplate model (data already migrated to Routine/HealthProtocol in 20260313b)

-- Remove FK and index from Task
DROP INDEX IF EXISTS "Task_recurringTemplateId_idx";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "recurringTemplateId";

-- Drop the RecurringTemplate table
DROP TABLE IF EXISTS "RecurringTemplate";
