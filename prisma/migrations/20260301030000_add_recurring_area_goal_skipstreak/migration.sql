-- AlterTable
ALTER TABLE "RecurringTemplate" ADD COLUMN "areaId" TEXT;
ALTER TABLE "RecurringTemplate" ADD COLUMN "goalId" TEXT;
ALTER TABLE "RecurringTemplate" ADD COLUMN "skipStreak" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
