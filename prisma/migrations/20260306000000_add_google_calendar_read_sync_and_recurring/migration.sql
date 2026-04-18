-- Phase 2a: Google Calendar Read Sync
ALTER TABLE "GoogleCalendarSync" ADD COLUMN "watchedCalendars" JSONB;
ALTER TABLE "GoogleCalendarSync" ADD COLUMN "lastReadSyncAt" TIMESTAMP(3);

-- Phase 2c: Recurring Calendar Events
ALTER TABLE "CalendarEvent" ADD COLUMN "recurrenceRule" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN "recurringEventId" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN "isRecurringInstance" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CalendarEvent" ADD COLUMN "excludedDates" JSONB;

-- Self-referential FK for recurring parent
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_recurringEventId_fkey" FOREIGN KEY ("recurringEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index for recurring instances lookup
CREATE INDEX "CalendarEvent_recurringEventId_idx" ON "CalendarEvent"("recurringEventId");

-- Unique constraint for external event upsert (nullable columns allow multiple nulls)
CREATE UNIQUE INDEX "CalendarEvent_userId_googleEventId_googleCalendarId_key" ON "CalendarEvent"("userId", "googleEventId", "googleCalendarId");
