-- CreateEnum
CREATE TYPE "DelegationStatus" AS ENUM ('PENDING', 'VIEWED', 'ACCEPTED', 'DECLINED', 'COMPLETED', 'RECALLED');

-- CreateEnum
CREATE TYPE "DelegationLanding" AS ENUM ('INBOX', 'DO_NOW');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DELEGATION_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'DELEGATION_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'DELEGATION_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'DELEGATION_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'DELEGATION_RECALLED';

-- AlterTable: WaitingFor — add delegation link
ALTER TABLE "WaitingFor" ADD COLUMN "delegated_user_id" TEXT;

-- CreateTable: delegations
CREATE TABLE "delegations" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "delegator_id" TEXT NOT NULL,
    "delegatee_id" TEXT NOT NULL,
    "status" "DelegationStatus" NOT NULL DEFAULT 'PENDING',
    "landingZone" "DelegationLanding" NOT NULL DEFAULT 'INBOX',
    "note" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewed_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "waiting_for_id" TEXT,

    CONSTRAINT "delegations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delegations_task_id_key" ON "delegations"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "delegations_waiting_for_id_key" ON "delegations"("waiting_for_id");

-- CreateIndex
CREATE INDEX "delegations_delegator_id_idx" ON "delegations"("delegator_id");

-- CreateIndex
CREATE INDEX
 "delegations_delegatee_id_idx" ON "delegations"("delegatee_id");

-- CreateIndex
CREATE INDEX "delegations_status_idx" ON "delegations"("status");

-- AddForeignKey
ALTER TABLE "WaitingFor" ADD CONSTRAINT "WaitingFor_delegated_user_id_fkey" FOREIGN KEY ("delegated_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_delegator_id_fkey" FOREIGN KEY ("delegator_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_delegatee_id_fkey" FOREIGN KEY ("delegatee_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_waiting_for_id_fkey" FOREIGN KEY ("waiting_for_id") REFERENCES "WaitingFor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
