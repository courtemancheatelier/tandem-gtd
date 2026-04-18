-- Health Protocol Cards
-- New models: HealthProtocol, HealthWindow, HealthItem, HealthLog
-- New field on Task: healthProtocolId

-- HealthProtocol
CREATE TABLE "HealthProtocol" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cron_expression" TEXT NOT NULL DEFAULT 'daily',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_generated" TIMESTAMP(3),
    "next_due" TIMESTAMP(3),
    "color" TEXT,
    "estimated_mins" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "areaId" TEXT,

    CONSTRAINT "HealthProtocol_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HealthProtocol_userId_idx" ON "HealthProtocol"("userId");
CREATE INDEX "HealthProtocol_is_active_idx" ON "HealthProtocol"("is_active");

ALTER TABLE "HealthProtocol" ADD CONSTRAINT "HealthProtocol_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthProtocol" ADD CONSTRAINT "HealthProtocol_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- HealthWindow
CREATE TABLE "HealthWindow" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetTime" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "constraint" TEXT,

    CONSTRAINT "HealthWindow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HealthWindow_protocolId_idx" ON "HealthWindow"("protocolId");

ALTER TABLE "HealthWindow" ADD CONSTRAINT "HealthWindow_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "HealthProtocol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- HealthItem
CREATE TABLE "HealthItem" (
    "id" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT,
    "form" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "HealthItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HealthItem_windowId_idx" ON "HealthItem"("windowId");

ALTER TABLE "HealthItem" ADD CONSTRAINT "HealthItem_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "HealthWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- HealthLog
CREATE TABLE "HealthLog" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "completedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HealthLog_protocolId_windowId_date_key" ON "HealthLog"("protocolId", "windowId", "date");
CREATE INDEX "HealthLog_userId_idx" ON "HealthLog"("userId");
CREATE INDEX "HealthLog_protocolId_date_idx" ON "HealthLog"("protocolId", "date");

ALTER TABLE "HealthLog" ADD CONSTRAINT "HealthLog_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "HealthProtocol"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthLog" ADD CONSTRAINT "HealthLog_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "HealthWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthLog" ADD CONSTRAINT "HealthLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add healthProtocolId to Task
ALTER TABLE "Task" ADD COLUMN "healthProtocolId" TEXT;
CREATE INDEX "Task_healthProtocolId_idx" ON "Task"("healthProtocolId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_healthProtocolId_fkey" FOREIGN KEY ("healthProtocolId") REFERENCES "HealthProtocol"("id") ON DELETE SET NULL ON UPDATE CASCADE;
