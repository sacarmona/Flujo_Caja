-- DropIndex
DROP INDEX "Reconciliation_bankMovementId_key";

-- CreateIndex
CREATE INDEX "Reconciliation_bankMovementId_idx" ON "Reconciliation"("bankMovementId");
