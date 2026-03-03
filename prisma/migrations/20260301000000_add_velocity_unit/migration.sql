-- CreateEnum
CREATE TYPE "VelocityUnit" AS ENUM ('TASKS', 'HOURS', 'AUTO');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "velocity_unit" "VelocityUnit" NOT NULL DEFAULT 'AUTO';
