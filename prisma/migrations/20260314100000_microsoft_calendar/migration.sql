-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN "microsoft_event_id" TEXT,
ADD COLUMN "microsoft_calendar_id" TEXT;

-- CreateTable
CREATE TABLE "microsoft_calendar_sync" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "default_calendar_id" TEXT,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "watchedCalendars" JSONB,
    "lastReadSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "microsoft_calendar_sync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "microsoft_calendar_sync_userId_key" ON "microsoft_calendar_sync"("userId");

-- AddForeignKey
ALTER TABLE "microsoft_calendar_sync" ADD CONSTRAINT "microsoft_calendar_sync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
