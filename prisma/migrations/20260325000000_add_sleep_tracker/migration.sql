-- AlterTable: Add sleep tracker fields to HealthProtocol (Routine)
ALTER TABLE "HealthProtocol" ADD COLUMN "target_bedtime" TEXT;
ALTER TABLE "HealthProtocol" ADD COLUMN "target_wake_time" TEXT;

-- CreateTable: SleepLog
CREATE TABLE "SleepLog" (
    "id" TEXT NOT NULL,
    "routine_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "bedtime" TIMESTAMP(3),
    "wake_time" TIMESTAMP(3),
    "target_bedtime" TEXT,
    "target_wake_time" TEXT,
    "duration_mins" INTEGER,
    "bedtime_on_time" BOOLEAN,
    "wake_on_time" BOOLEAN,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SleepLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SleepLog_userId_idx" ON "SleepLog"("userId");
CREATE INDEX "SleepLog_routine_id_date_idx" ON "SleepLog"("routine_id", "date");
CREATE UNIQUE INDEX "SleepLog_routine_id_date_key" ON "SleepLog"("routine_id", "date");

-- AddForeignKey
ALTER TABLE "SleepLog" ADD CONSTRAINT "SleepLog_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "HealthProtocol"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SleepLog" ADD CONSTRAINT "SleepLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
