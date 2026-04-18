-- AlterEnum: Add new DecisionStatus values
ALTER TYPE "DecisionStatus" ADD VALUE 'DRAFT';
ALTER TYPE "DecisionStatus" ADD VALUE 'GATHERING_INPUT';
ALTER TYPE "DecisionStatus" ADD VALUE 'UNDER_REVIEW';
ALTER TYPE "DecisionStatus" ADD VALUE 'DECIDED';
ALTER TYPE "DecisionStatus" ADD VALUE 'DEFERRED';
ALTER TYPE "DecisionStatus" ADD VALUE 'CANCELED';

-- AlterEnum: Add PROPOSAL to DecisionType
ALTER TYPE "DecisionType" ADD VALUE 'PROPOSAL';

-- CreateEnum: InputRequestType
CREATE TYPE "InputRequestType" AS ENUM ('RESEARCH', 'VOTE', 'REVIEW', 'APPROVAL_INPUT', 'OPEN_INPUT');

-- CreateEnum: InputRequestStatus
CREATE TYPE "InputRequestStatus" AS ENUM ('PENDING', 'SUBMITTED', 'WAIVED', 'EXPIRED');

-- CreateEnum: DecisionEventType
CREATE TYPE "DecisionEventType" AS ENUM ('CREATED', 'PUBLISHED', 'INPUT_REQUESTED', 'CONTRIBUTION_ADDED', 'VOTE_CAST', 'VOTE_CHANGED', 'DEADLINE_SET', 'DEADLINE_REACHED', 'MOVED_TO_REVIEW', 'DECIDED', 'DEFERRED_EVENT', 'CANCELED_EVENT', 'COMMENT_ADDED', 'REMINDER_SENT');

-- AlterEnum: Add new NotificationType values
ALTER TYPE "NotificationType" ADD VALUE 'DECISION_PUBLISHED';
ALTER TYPE "NotificationType" ADD VALUE 'DECISION_INPUT_NEEDED';
ALTER TYPE "NotificationType" ADD VALUE 'DECISION_INPUT_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'DECISION_ALL_INPUTS_COMPLETE';
ALTER TYPE "NotificationType" ADD VALUE 'DECISION_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE 'DECISION_DEFERRED';
ALTER TYPE "NotificationType" ADD VALUE 'DECISION_CANCELED';

-- AlterTable: Add Decision Proposal fields to DecisionRequest
ALTER TABLE "DecisionRequest" ADD COLUMN "description" TEXT;
ALTER TABLE "DecisionRequest" ADD COLUMN "outcome" TEXT;
ALTER TABLE "DecisionRequest" ADD COLUMN "rationale" TEXT;
ALTER TABLE "DecisionRequest" ADD COLUMN "decided_at" TIMESTAMP(3);
ALTER TABLE "DecisionRequest" ADD COLUMN "wiki_article_id" TEXT;
ALTER TABLE "DecisionRequest" ADD COLUMN "wiki_section" TEXT;
ALTER TABLE "DecisionRequest" ADD COLUMN "proposal_project_id" TEXT;

-- CreateTable: DecisionInputRequest
CREATE TABLE "decision_input_requests" (
    "id" TEXT NOT NULL,
    "decision_id" TEXT NOT NULL,
    "assignee_id" TEXT NOT NULL,
    "type" "InputRequestType" NOT NULL DEFAULT 'RESEARCH',
    "prompt" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "status" "InputRequestStatus" NOT NULL DEFAULT 'PENDING',
    "responded_at" TIMESTAMP(3),
    "task_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_input_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DecisionEvent
CREATE TABLE "decision_events" (
    "id" TEXT NOT NULL,
    "decision_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "type" "DecisionEventType" NOT NULL,
    "details" JSONB,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "decision_input_requests_decision_id_idx" ON "decision_input_requests"("decision_id");
CREATE INDEX "decision_input_requests_assignee_id_idx" ON "decision_input_requests"("assignee_id");
CREATE INDEX "decision_input_requests_status_idx" ON "decision_input_requests"("status");
CREATE UNIQUE INDEX "decision_input_requests_task_id_key" ON "decision_input_requests"("task_id");

CREATE INDEX "decision_events_decision_id_idx" ON "decision_events"("decision_id");
CREATE INDEX "decision_events_actor_id_idx" ON "decision_events"("actor_id");

CREATE INDEX "DecisionRequest_proposal_project_id_idx" ON "DecisionRequest"("proposal_project_id");

-- AddForeignKey
ALTER TABLE "DecisionRequest" ADD CONSTRAINT "DecisionRequest_wiki_article_id_fkey" FOREIGN KEY ("wiki_article_id") REFERENCES "WikiArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DecisionRequest" ADD CONSTRAINT "DecisionRequest_proposal_project_id_fkey" FOREIGN KEY ("proposal_project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "decision_input_requests" ADD CONSTRAINT "decision_input_requests_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "DecisionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "decision_input_requests" ADD CONSTRAINT "decision_input_requests_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision_input_requests" ADD CONSTRAINT "decision_input_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "decision_events" ADD CONSTRAINT "decision_events_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "DecisionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "decision_events" ADD CONSTRAINT "decision_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
