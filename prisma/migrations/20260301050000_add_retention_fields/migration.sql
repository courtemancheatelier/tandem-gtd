-- AlterTable
ALTER TABLE "ServerSettings" ADD COLUMN "retentionEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ServerSettings" ADD COLUMN "retentionPeriodDays" INTEGER NOT NULL DEFAULT 180;
ALTER TABLE "ServerSettings" ADD COLUMN "retentionGraceDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "ServerSettings" ADD COLUMN "retentionExportPath" TEXT;
ALTER TABLE "ServerSettings" ADD COLUMN "retentionExportKeepDays" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "ServerSettings" ADD COLUMN "retentionStandaloneTasks" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ServerSettings" ADD COLUMN "retentionBatchSize" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "RetentionLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "projectId" TEXT,
    "projectTitle" TEXT,
    "taskCount" INTEGER NOT NULL DEFAULT 0,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "exportPath" TEXT,
    "actorType" "ActorType" NOT NULL DEFAULT 'SYSTEM',
    "actorId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetentionLog_action_createdAt_idx" ON "RetentionLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "RetentionLog_projectId_idx" ON "RetentionLog"("projectId");

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "retentionExempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "purgeScheduledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Project_status_completedAt_retentionExempt_purgeScheduledAt_idx" ON "Project"("status", "completedAt", "retentionExempt", "purgeScheduledAt");
