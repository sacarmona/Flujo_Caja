import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { accountingPlan } from "./accounting-plan.mjs";

// Copia local de feriados chilenos 2025-2026 (debe coincidir con
// src/lib/holidays-cl.ts). Los feriados moviles (Viernes/Sabado Santo) se
// cargan explicitamente por ano en vez de calcularse.
const chileHolidays = [
  { date: "2025-01-01", name: "Ano Nuevo" },
  { date: "2025-04-18", name: "Viernes Santo" },
  { date: "2025-04-19", name: "Sabado Santo" },
  { date: "2025-05-01", name: "Dia del Trabajo" },
  { date: "2025-05-21", name: "Dia de las Glorias Navales" },
  { date: "2025-06-29", name: "San Pedro y San Pablo" },
  { date: "2025-07-16", name: "Dia de la Virgen del Carmen" },
  { date: "2025-08-15", name: "Asuncion de la Virgen" },
  { date: "2025-09-18", name: "Fiestas Patrias" },
  { date: "2025-09-19", name: "Glorias del Ejercito" },
  { date: "2025-10-12", name: "Encuentro de Dos Mundos" },
  { date: "2025-10-31", name: "Dia de las Iglesias Evangelicas" },
  { date: "2025-11-01", name: "Dia de Todos los Santos" },
  { date: "2025-12-08", name: "Inmaculada Concepcion" },
  { date: "2025-12-25", name: "Navidad" },
  { date: "2026-01-01", name: "Ano Nuevo" },
  { date: "2026-04-03", name: "Viernes Santo" },
  { date: "2026-04-04", name: "Sabado Santo" },
  { date: "2026-05-01", name: "Dia del Trabajo" },
  { date: "2026-05-21", name: "Dia de las Glorias Navales" },
  { date: "2026-06-29", name: "San Pedro y San Pablo" },
  { date: "2026-07-16", name: "Dia de la Virgen del Carmen" },
  { date: "2026-08-15", name: "Asuncion de la Virgen" },
  { date: "2026-09-18", name: "Fiestas Patrias" },
  { date: "2026-09-19", name: "Glorias del Ejercito" },
  { date: "2026-10-12", name: "Encuentro de Dos Mundos" },
  { date: "2026-10-31", name: "Dia de las Iglesias Evangelicas" },
  { date: "2026-11-01", name: "Dia de Todos los Santos" },
  { date: "2026-12-08", name: "Inmaculada Concepcion" },
  { date: "2026-12-25", name: "Navidad" }
];

const prisma = new PrismaClient();

const companyName = "ADENTU Ingenier\u00eda SpA";
const businessUnits = ["Inspecciones", "TVM", "Saesa", "Plataforma", "Casa Matriz", "Sin asignar"];

// Usuarios de demostracion, sin contrasenas reales. La contrasena de ambos
// es "ChangeMe123!" solo para entornos de desarrollo.
const demoUsers = [
  { email: "admin@adentu.cl", name: "Usuario Demo Admin", role: "ADMIN" },
  { email: "finanzas@adentu.cl", name: "Usuario Demo Finanzas", role: "FINANCE" }
];

// Construye una fecha local (no UTC) a partir de "YYYY-MM-DD", consistente
// con dateOnly/dateKey de src/lib/recurrences.ts, que usan los metodos
// locales de Date (getFullYear/getMonth/getDate). Usar `new Date(iso)`
// directamente parsea como UTC y desfasa el dia al leer con metodos locales
// en zonas horarias negativas como America/Santiago.
function localDateFromISO(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

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

  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);

  for (const demoUser of demoUsers) {
    await prisma.user.upsert({
      where: { email: demoUser.email },
      update: { name: demoUser.name, role: demoUser.role, companyId: company.id },
      create: {
        companyId: company.id,
        email: demoUser.email,
        name: demoUser.name,
        role: demoUser.role,
        passwordHash
      }
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

  for (const holiday of chileHolidays) {
    const date = localDateFromISO(holiday.date);
    await prisma.holiday.upsert({
      where: { date },
      update: { name: holiday.name },
      create: { date, name: holiday.name, isManual: false }
    });
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
