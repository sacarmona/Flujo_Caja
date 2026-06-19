/*
  Warnings:

  - You are about to drop the `EmailLoginToken` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `passwordHash` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "AccountingAccount" DROP CONSTRAINT "AccountingAccount_parentId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT NOT NULL;

-- DropTable
DROP TABLE "EmailLoginToken";

-- AddForeignKey
ALTER TABLE "AccountingAccount" ADD CONSTRAINT "AccountingAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AccountingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
