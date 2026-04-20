-- Add progressive difficulty to recurring templates
ALTER TABLE "RecurringTemplate" ADD COLUMN "progression_base_value" INTEGER;
ALTER TABLE "RecurringTemplate" ADD COLUMN "progression_increment" INTEGER;
ALTER TABLE "RecurringTemplate" ADD COLUMN "progression_unit" TEXT;
ALTER TABLE "RecurringTemplate" ADD COLUMN "progression_frequency" TEXT;
ALTER TABLE "RecurringTemplate" ADD COLUMN "progression_start_date" TIMESTAMP(3);
