-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM (
    'DAILY',
    'BUSINESS_DAYS',
    'EVERY_N_DAYS',
    'WEEKLY',
    'BIWEEKLY',
    'MONTHLY',
    'QUARTERLY',
    'SEMIANNUAL',
    'ANNUAL'
);

-- AlterTable
ALTER TABLE "Movement"
    ADD COLUMN "recurrenceRuleId" TEXT,
    ADD COLUMN "recurrenceOccurrenceDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RecurrenceRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "accountingAccountId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "projectId" TEXT,
    "costCenterId" TEXT,
    "type" "MovementType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'CLP',
    "frequency" "RecurrenceFrequency" NOT NULL,
    "intervalDays" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "MovementStatus" NOT NULL DEFAULT 'PROJECTED',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "nextEditScope" TEXT NOT NULL DEFAULT 'THIS_OCCURRENCE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurrenceRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Movement_recurrenceRuleId_idx" ON "Movement"("recurrenceRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "Movement_recurrenceRuleId_recurrenceOccurrenceDate_key" ON "Movement"("recurrenceRuleId", "recurrenceOccurrenceDate");

-- CreateIndex
CREATE INDEX "RecurrenceRule_accountingAccountId_idx" ON "RecurrenceRule"("accountingAccountId");

-- CreateIndex
CREATE INDEX "RecurrenceRule_bankAccountId_idx" ON "RecurrenceRule"("bankAccountId");

-- CreateIndex
CREATE INDEX "RecurrenceRule_businessUnitId_idx" ON "RecurrenceRule"("businessUnitId");

-- CreateIndex
CREATE INDEX "RecurrenceRule_companyId_startDate_idx" ON "RecurrenceRule"("companyId", "startDate");

-- CreateIndex
CREATE INDEX "RecurrenceRule_costCenterId_idx" ON "RecurrenceRule"("costCenterId");

-- CreateIndex
CREATE INDEX "RecurrenceRule_projectId_idx" ON "RecurrenceRule"("projectId");

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_recurrenceRuleId_fkey"
FOREIGN KEY ("recurrenceRuleId") REFERENCES "RecurrenceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_accountingAccountId_fkey" FOREIGN KEY ("accountingAccountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Financial invariants
ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_amount_positive_check" CHECK ("amount" > 0);
ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_intervalDays_positive_check" CHECK ("intervalDays" IS NULL OR "intervalDays" > 0);
