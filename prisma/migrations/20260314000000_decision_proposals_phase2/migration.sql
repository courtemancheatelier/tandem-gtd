-- AlterEnum
ALTER TYPE "DecisionType" ADD VALUE 'QUICK_POLL';

-- AlterTable
ALTER TABLE "DecisionRespondent" ADD COLUMN "task_id" TEXT;

-- CreateTable
CREATE TABLE "decision_contributions" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decision_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,

    CONSTRAINT "decision_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "decision_contributions_decision_id_idx" ON "decision_contributions"("decision_id");

-- CreateIndex
CREATE INDEX "decision_contributions_author_id_idx" ON "decision_contributions"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionRespondent_task_id_key" ON "DecisionRespondent"("task_id");

-- AddForeignKey
ALTER TABLE "DecisionRespondent" ADD CONSTRAINT "DecisionRespondent_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_contributions" ADD CONSTRAINT "decision_contributions_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "DecisionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_contributions" ADD CONSTRAINT "decision_contributions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
