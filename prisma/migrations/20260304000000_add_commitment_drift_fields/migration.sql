-- AlterTable: Add commitment drift fields to User
ALTER TABLE "User" ADD COLUMN "drift_dashboard_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "drift_displacement_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "drift_breakdown_threshold" INTEGER NOT NULL DEFAULT 4;

-- AlterTable: Add commitment drift fields to Task
ALTER TABLE "Task" ADD COLUMN "deferral_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN "due_date_push_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN "original_due_date" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "total_drift_days" INTEGER NOT NULL DEFAULT 0;
