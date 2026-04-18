-- CreateEnum
CREATE TYPE "TimeAuditStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "TimeAuditChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "TimeAuditStatus" NOT NULL DEFAULT 'ACTIVE',
    "pausedAt" TIMESTAMP(3),
    "totalPaused" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeAuditChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeAuditEntry" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "intervalStart" TIMESTAMP(3) NOT NULL,
    "intervalEnd" TIMESTAMP(3) NOT NULL,
    "tags" TEXT[],
    "note" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeAuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeAuditChallenge_userId_status_idx" ON "TimeAuditChallenge"("userId", "status");

-- CreateIndex
CREATE INDEX "TimeAuditChallenge_userId_createdAt_idx" ON "TimeAuditChallenge"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TimeAuditEntry_challengeId_intervalStart_idx" ON "TimeAuditEntry"("challengeId", "intervalStart");

-- AddForeignKey
ALTER TABLE "TimeAuditChallenge" ADD CONSTRAINT "TimeAuditChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeAuditEntry" ADD CONSTRAINT "TimeAuditEntry_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "TimeAuditChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeAuditEntry" ADD CONSTRAINT "TimeAuditEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
