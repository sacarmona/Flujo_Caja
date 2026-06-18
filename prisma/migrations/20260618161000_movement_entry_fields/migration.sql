-- AlterTable
ALTER TABLE "Movement"
    ADD COLUMN "bankAccountId" TEXT,
    ADD COLUMN "notes" TEXT;

-- Existing rows, if any, must be assigned before this migration can enforce NOT NULL.
UPDATE "Movement"
SET "bankAccountId" = (
    SELECT "BankAccount"."id"
    FROM "BankAccount"
    WHERE "BankAccount"."companyId" = "Movement"."companyId"
    ORDER BY
        CASE WHEN "BankAccount"."name" = 'Cuenta Corriente Santander' THEN 0 ELSE 1 END,
        "BankAccount"."createdAt" ASC
    LIMIT 1
)
WHERE "bankAccountId" IS NULL;

ALTER TABLE "Movement" ALTER COLUMN "bankAccountId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Movement_bankAccountId_idx" ON "Movement"("bankAccountId");

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_bankAccountId_fkey"
FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
