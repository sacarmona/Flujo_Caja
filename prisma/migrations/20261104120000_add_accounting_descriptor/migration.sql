-- CreateTable
CREATE TABLE "AccountingDescriptor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "accountingAccountId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingDescriptor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingDescriptor_companyId_pattern_key" ON "AccountingDescriptor"("companyId", "pattern");

-- CreateIndex
CREATE INDEX "AccountingDescriptor_companyId_idx" ON "AccountingDescriptor"("companyId");

-- CreateIndex
CREATE INDEX "AccountingDescriptor_accountingAccountId_idx" ON "AccountingDescriptor"("accountingAccountId");

-- AddForeignKey
ALTER TABLE "AccountingDescriptor" ADD CONSTRAINT "AccountingDescriptor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDescriptor" ADD CONSTRAINT "AccountingDescriptor_accountingAccountId_fkey" FOREIGN KEY ("accountingAccountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
