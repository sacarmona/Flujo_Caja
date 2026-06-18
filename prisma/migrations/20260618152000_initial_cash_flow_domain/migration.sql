-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'FINANCE', 'MOVEMENT_ENTRY', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "MovementStatus" AS ENUM ('PROJECTED', 'PENDING', 'PARTIALLY_PAID', 'PAID_OR_COLLECTED', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('CLP', 'UF', 'EUR', 'USD');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'CANCEL', 'SOFT_DELETE', 'LOGIN', 'LOGOUT');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'es-CL',
    "timeZone" TEXT NOT NULL DEFAULT 'America/Santiago',
    "baseCurrency" "Currency" NOT NULL DEFAULT 'CLP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'READ_ONLY',
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLoginToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLoginToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessUnit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT,
    "currency" "Currency" NOT NULL DEFAULT 'CLP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningBalance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'CLP',
    "balanceDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpeningBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "accountingAccountId" TEXT NOT NULL,
    "projectId" TEXT,
    "costCenterId" TEXT,
    "type" "MovementType" NOT NULL,
    "status" "MovementStatus" NOT NULL DEFAULT 'PROJECTED',
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'CLP',
    "projectedDate" TIMESTAMP(3) NOT NULL,
    "realDate" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'CLP',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromCurrency" "Currency" NOT NULL,
    "toCurrency" "Currency" NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "rateDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLoginToken_tokenHash_key" ON "EmailLoginToken"("tokenHash");

-- CreateIndex
CREATE INDEX "BusinessUnit_companyId_idx" ON "BusinessUnit"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUnit_companyId_name_key" ON "BusinessUnit"("companyId", "name");

-- CreateIndex
CREATE INDEX "Project_businessUnitId_idx" ON "Project"("businessUnitId");

-- CreateIndex
CREATE INDEX "Project_companyId_idx" ON "Project"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_companyId_name_key" ON "Project"("companyId", "name");

-- CreateIndex
CREATE INDEX "CostCenter_companyId_idx" ON "CostCenter"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_companyId_name_key" ON "CostCenter"("companyId", "name");

-- CreateIndex
CREATE INDEX "AccountingAccount_companyId_idx" ON "AccountingAccount"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingAccount_companyId_code_key" ON "AccountingAccount"("companyId", "code");

-- CreateIndex
CREATE INDEX "BankAccount_companyId_idx" ON "BankAccount"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_companyId_name_key" ON "BankAccount"("companyId", "name");

-- CreateIndex
CREATE INDEX "OpeningBalance_companyId_idx" ON "OpeningBalance"("companyId");

-- CreateIndex
CREATE INDEX "OpeningBalance_bankAccountId_idx" ON "OpeningBalance"("bankAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningBalance_bankAccountId_balanceDate_key" ON "OpeningBalance"("bankAccountId", "balanceDate");

-- CreateIndex
CREATE INDEX "Movement_accountingAccountId_idx" ON "Movement"("accountingAccountId");

-- CreateIndex
CREATE INDEX "Movement_businessUnitId_idx" ON "Movement"("businessUnitId");

-- CreateIndex
CREATE INDEX "Movement_companyId_projectedDate_idx" ON "Movement"("companyId", "projectedDate");

-- CreateIndex
CREATE INDEX "Movement_costCenterId_idx" ON "Movement"("costCenterId");

-- CreateIndex
CREATE INDEX "Movement_projectId_idx" ON "Movement"("projectId");

-- CreateIndex
CREATE INDEX "Payment_bankAccountId_idx" ON "Payment"("bankAccountId");

-- CreateIndex
CREATE INDEX "Payment_movementId_idx" ON "Payment"("movementId");

-- CreateIndex
CREATE INDEX "ExchangeRate_companyId_idx" ON "ExchangeRate"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_companyId_fromCurrency_toCurrency_rateDate_key" ON "ExchangeRate"("companyId", "fromCurrency", "toCurrency", "rateDate");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_entity_entityId_idx" ON "AuditLog"("companyId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessUnit" ADD CONSTRAINT "BusinessUnit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingAccount" ADD CONSTRAINT "AccountingAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_accountingAccountId_fkey" FOREIGN KEY ("accountingAccountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "Movement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Financial invariants
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_amount_positive_check" CHECK ("amount" > 0);
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_amount_positive_check" CHECK ("amount" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive_check" CHECK ("amount" > 0);
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_rate_positive_check" CHECK ("rate" > 0);

