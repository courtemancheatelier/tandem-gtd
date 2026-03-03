-- AlterTable
ALTER TABLE "Task" ADD COLUMN "recurringTemplateId" TEXT;

-- CreateIndex
CREATE INDEX "Task_recurringTemplateId_idx" ON "Task"("recurringTemplateId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_recurringTemplateId_fkey" FOREIGN KEY ("recurringTemplateId") REFERENCES "RecurringTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
