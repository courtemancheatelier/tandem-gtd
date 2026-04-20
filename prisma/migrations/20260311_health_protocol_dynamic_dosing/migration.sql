-- Add dynamic dosing fields to HealthProtocol
ALTER TABLE "HealthProtocol" ADD COLUMN "protocol_type" TEXT NOT NULL DEFAULT 'static';
ALTER TABLE "HealthProtocol" ADD COLUMN "start_date" TIMESTAMP(3);
ALTER TABLE "HealthProtocol" ADD COLUMN "total_days" INTEGER;

-- Add ramp schedule to HealthItem
ALTER TABLE "HealthItem" ADD COLUMN "ramp_schedule" JSONB;

-- Add day number to HealthLog
ALTER TABLE "HealthLog" ADD COLUMN "day_number" INTEGER;
