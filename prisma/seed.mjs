import { Prisma, PrismaClient } from "@prisma/client";
import { accountingPlan } from "./accounting-plan.mjs";

const prisma = new PrismaClient();

const companyName = "ADENTU Ingenier\u00eda SpA";
const businessUnits = ["Inspecciones", "TVM", "Saesa", "Plataforma", "Casa Matriz", "Sin asignar"];

async function upsertAccountingAccount(companyId, account, parent = null, level = 1) {
  const saved = await prisma.accountingAccount.upsert({
    where: { companyId_code: { companyId, code: account.code } },
    update: {
      parentId: parent?.id ?? null,
      name: account.name,
      type: account.type ?? parent.type,
      sortOrder: account.sortOrder,
      level,
      isActive: true,
      allowMovements: !account.children?.length,
      deletedAt: null
    },
    create: {
      companyId,
      parentId: parent?.id ?? null,
      code: account.code,
      name: account.name,
      type: account.type ?? parent.type,
      sortOrder: account.sortOrder,
      level,
      isActive: true,
      allowMovements: !account.children?.length
    }
  });

  for (const child of account.children ?? []) {
    await upsertAccountingAccount(companyId, child, saved, level + 1);
  }

  return saved;
}

async function main() {
  const company = await prisma.company.upsert({
    where: { name: companyName },
    update: {
      baseCurrency: "CLP",
      locale: "es-CL",
      timeZone: "America/Santiago"
    },
    create: {
      name: companyName,
      baseCurrency: "CLP",
      locale: "es-CL",
      timeZone: "America/Santiago"
    }
  });

  for (const name of businessUnits) {
    await prisma.businessUnit.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      update: { isActive: true, deletedAt: null },
      create: { companyId: company.id, name }
    });
  }

  const bankAccount = await prisma.bankAccount.upsert({
    where: { companyId_name: { companyId: company.id, name: "Cuenta Corriente Santander" } },
    update: {
      bankName: "Santander",
      currency: "CLP",
      isActive: true,
      deletedAt: null
    },
    create: {
      companyId: company.id,
      name: "Cuenta Corriente Santander",
      bankName: "Santander",
      currency: "CLP"
    }
  });

  const openingBalance = process.env.OPENING_BALANCE_CLP?.trim();

  for (const account of accountingPlan) {
    await upsertAccountingAccount(company.id, account);
  }

  if (openingBalance) {
    const balanceDate = new Date(process.env.OPENING_BALANCE_DATE ?? "2026-01-01");

    await prisma.openingBalance.upsert({
      where: {
        bankAccountId_balanceDate: {
          bankAccountId: bankAccount.id,
          balanceDate
        }
      },
      update: {
        amount: new Prisma.Decimal(openingBalance),
        currency: "CLP",
        deletedAt: null
      },
      create: {
        companyId: company.id,
        bankAccountId: bankAccount.id,
        amount: new Prisma.Decimal(openingBalance),
        currency: "CLP",
        balanceDate,
        note: "Saldo inicial configurado por variable de entorno."
      }
    });
  } else {
    console.log("OPENING_BALANCE_CLP no definido; no se crea saldo inicial.");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
