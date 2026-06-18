-- AlterTable
ALTER TABLE "RecurrenceRule"
    ADD COLUMN "dayOfMonth" INTEGER,
    ADD COLUMN "dayOfWeek" INTEGER;

ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_dayOfMonth_range_check" CHECK ("dayOfMonth" IS NULL OR ("dayOfMonth" >= 1 AND "dayOfMonth" <= 31));
ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_dayOfWeek_range_check" CHECK ("dayOfWeek" IS NULL OR ("dayOfWeek" >= 0 AND "dayOfWeek" <= 6));
