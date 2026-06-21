-- AlterTable
ALTER TABLE "RecurrenceRule" ADD COLUMN     "manualRate" DECIMAL(18,6),
ADD COLUMN     "manualRateReason" TEXT;
