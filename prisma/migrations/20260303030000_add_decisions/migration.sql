-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('OPEN', 'RESOLVED', 'EXPIRED', 'WITHDRAWN');
CREATE TYPE "DecisionVote" AS ENUM ('APPROVE', 'REJECT', 'COMMENT', 'DEFER');

-- AlterEnum (TaskEventType)
ALTER TYPE "TaskEventType" ADD VALUE 'DECISION_REQUESTED';
ALTER TYPE "TaskEventType" ADD VALUE 'DECISION_RESOLVED';

-- AlterEnum (ProjectEventType)
ALTER TYPE "ProjectEventType" ADD VALUE 'DECISION_REQUESTED';
ALTER TYPE "ProjectEventType" ADD VALUE 'DECISION_RESOLVED';

-- CreateTable: DecisionRequest
CREATE TABLE "DecisionRequest" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "context" TEXT,
    "status" "DecisionStatus" NOT NULL DEFAULT 'OPEN',
    "deadline" TIMESTAMP(3),
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "thread_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,

    CONSTRAINT "DecisionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DecisionRespondent
CREATE TABLE "DecisionRespondent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DecisionRespondent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DecisionResponse
CREATE TABLE "DecisionResponse" (
    "id" TEXT NOT NULL,
    "vote" "DecisionVote" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decisionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DecisionResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DecisionRequest_thread_id_key" ON "DecisionRequest"("thread_id");
CREATE INDEX "DecisionRequest_requester_id_idx" ON "DecisionRequest"("requester_id");
CREATE INDEX "DecisionRequest_status_idx" ON "DecisionRequest"("status");
CREATE INDEX "DecisionRequest_deadline_idx" ON "DecisionRequest"("deadline");

CREATE UNIQUE INDEX "DecisionRespondent_decisionId_userId_key" ON "DecisionRespondent"("decisionId", "userId");
CREATE INDEX "DecisionRespondent_userId_idx" ON "DecisionRespondent"("userId");

CREATE UNIQUE INDEX "DecisionResponse_decisionId_userId_key" ON "DecisionResponse"("decisionId", "userId");
CREATE INDEX "DecisionResponse_decisionId_idx" ON "DecisionResponse"("decisionId");

-- AddForeignKey
ALTER TABLE "DecisionRequest" ADD CONSTRAINT "DecisionRequest_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionRequest" ADD CONSTRAINT "DecisionRequest_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DecisionRespondent" ADD CONSTRAINT "DecisionRespondent_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "DecisionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionRespondent" ADD CONSTRAINT "DecisionRespondent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DecisionResponse" ADD CONSTRAINT "DecisionResponse_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "DecisionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionResponse" ADD CONSTRAINT "DecisionResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
