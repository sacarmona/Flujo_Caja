-- CreateEnum
CREATE TYPE "AccountingAccountType" AS ENUM (
    'INCOME',
    'DIRECT_COST',
    'ADMIN_EXPENSE',
    'TAX',
    'FINANCING',
    'INVESTMENT',
    'NON_OPERATIONAL'
);

-- AlterTable
ALTER TABLE "AccountingAccount"
    ADD COLUMN "parentId" TEXT,
    ADD COLUMN "type" "AccountingAccountType" NOT NULL DEFAULT 'NON_OPERATIONAL',
    ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "level" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "allowMovements" BOOLEAN NOT NULL DEFAULT true;

-- Existing accounts become leaf accounts until classified by seed or admin.
ALTER TABLE "AccountingAccount" ALTER COLUMN "type" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "AccountingAccount_parentId_idx" ON "AccountingAccount"("parentId");

-- AddForeignKey
ALTER TABLE "AccountingAccount" ADD CONSTRAINT "AccountingAccount_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
