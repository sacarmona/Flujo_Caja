-- AlterTable
ALTER TABLE "Movement"
    ADD COLUMN "conversionDate" TIMESTAMP(3),
    ADD COLUMN "projectedRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    ADD COLUMN "projectedAmountClp" DECIMAL(14,2),
    ADD COLUMN "exchangeRateSource" TEXT NOT NULL DEFAULT 'CLP',
    ADD COLUMN "isManualRate" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "manualRateReason" TEXT;

-- Existing movement rows keep their historical amount as CLP-equivalent until corrected explicitly.
UPDATE "Movement"
SET
    "conversionDate" = "projectedDate",
    "projectedAmountClp" = "amount"
WHERE "conversionDate" IS NULL OR "projectedAmountClp" IS NULL;

ALTER TABLE "Movement" ALTER COLUMN "conversionDate" SET NOT NULL;
ALTER TABLE "Movement" ALTER COLUMN "projectedAmountClp" SET NOT NULL;

ALTER TABLE "Movement" ADD CONSTRAINT "Movement_projectedRate_positive_check" CHECK ("projectedRate" > 0);
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_projectedAmountClp_positive_check" CHECK ("projectedAmountClp" > 0);
