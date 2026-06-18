-- AlterTable
ALTER TABLE "Payment"
    ADD COLUMN "cancelledAt" TIMESTAMP(3),
    ADD COLUMN "cancelReason" TEXT;
