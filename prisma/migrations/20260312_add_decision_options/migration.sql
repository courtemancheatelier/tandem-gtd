-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('APPROVAL', 'POLL');

-- AlterTable
ALTER TABLE "DecisionRequest" ADD COLUMN "decisionType" "DecisionType" NOT NULL DEFAULT 'APPROVAL';

-- CreateTable
CREATE TABLE "DecisionOption" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isChosen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisionId" TEXT NOT NULL,

    CONSTRAINT "DecisionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionOptionVote" (
    "id" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decisionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,

    CONSTRAINT "DecisionOptionVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DecisionOption_decisionId_idx" ON "DecisionOption"("decisionId");

-- CreateIndex
CREATE INDEX "DecisionOptionVote_optionId_idx" ON "DecisionOptionVote"("optionId");

-- CreateIndex
CREATE INDEX "DecisionOptionVote_voterId_idx" ON "DecisionOptionVote"("voterId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionOptionVote_decisionId_voterId_key" ON "DecisionOptionVote"("decisionId", "voterId");

-- AddForeignKey
ALTER TABLE "DecisionOption" ADD CONSTRAINT "DecisionOption_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "DecisionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionOptionVote" ADD CONSTRAINT "DecisionOptionVote_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "DecisionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionOptionVote" ADD CONSTRAINT "DecisionOptionVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "DecisionOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionOptionVote" ADD CONSTRAINT "DecisionOptionVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
