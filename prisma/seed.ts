import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Datos de demostración, claramente identificados como tales. No se inventa
 * el saldo inicial real ni la fecha del saldo: ese dato queda pendiente de
 * registrar manualmente por un usuario ADMIN o FINANCE usando la función de
 * saldo inicial (InitialBalance). El RUT de la empresa es un valor de
 * ejemplo y debe reemplazarse por el RUT real de ADENTU Ingeniería SpA.
 */
async function main() {
  const company = await prisma.company.upsert({
    where: { rut: "76.000.000-0" },
    update: {},
    create: {
      name: "ADENTU Ingeniería SpA",
      rut: "76.000.000-0", // PLACEHOLDER — reemplazar por el RUT real
    },
  });

  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@adentu.cl" },
    update: {},
    create: {
      companyId: company.id,
      name: "Usuario Demo Admin",
      email: "admin@adentu.cl",
      passwordHash,
      role: "ADMIN",
    },
  });

  await prisma.user.upsert({
    where: { email: "finanzas@adentu.cl" },
    update: {},
    create: {
      companyId: company.id,
      name: "Usuario Demo Finanzas",
      email: "finanzas@adentu.cl",
      passwordHash,
      role: "FINANCE",
    },
  });

  const businessUnitNames = ["Inspecciones", "TVM", "Saesa", "Plataforma", "Casa Matriz", "Sin asignar"];
  const businessUnits: Record<string, { id: string }> = {};
  for (const name of businessUnitNames) {
    businessUnits[name] = await prisma.businessUnit.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      update: {},
      create: { companyId: company.id, name },
    });
  }

  const bankAccount = await prisma.bankAccount.upsert({
    where: { id: "seed-bank-account-santander" },
    update: {},
    create: {
      id: "seed-bank-account-santander",
      companyId: company.id,
      name: "Cuenta Corriente Santander",
      currency: "CLP",
      active: true,
      isDefault: true,
    },
  });

  // Plan de cuentas inicial para una empresa chilena de ingeniería, inspecciones y servicios.
  const chartOfAccounts: Array<{
    code: string;
    name: string;
    type:
      | "INGRESO"
      | "COSTO_DIRECTO"
      | "GASTO_ADMINISTRATIVO"
      | "IMPUESTO"
      | "FINANCIAMIENTO"
      | "INVERSION"
      | "NO_OPERACIONAL";
    parentCode?: string;
  }> = [
    { code: "1", name: "Ingresos", type: "INGRESO" },
    { code: "1.1", name: "Servicios de Inspección", type: "INGRESO", parentCode: "1" },
    { code: "1.2", name: "Servicios Topográficos y Vuelos (TVM)", type: "INGRESO", parentCode: "1" },
    { code: "1.3", name: "Servicios a Saesa", type: "INGRESO", parentCode: "1" },
    { code: "1.4", name: "Plataforma / Software", type: "INGRESO", parentCode: "1" },
    { code: "1.9", name: "Otros Ingresos", type: "INGRESO", parentCode: "1" },

    { code: "2", name: "Costos Directos", type: "COSTO_DIRECTO" },
    { code: "2.1", name: "Subcontratos de Terreno", type: "COSTO_DIRECTO", parentCode: "2" },
    { code: "2.2", name: "Movilización y Viáticos", type: "COSTO_DIRECTO", parentCode: "2" },
    { code: "2.3", name: "Equipos e Insumos de Terreno", type: "COSTO_DIRECTO", parentCode: "2" },
    { code: "2.4", name: "Arriendo de Drones / Equipos", type: "COSTO_DIRECTO", parentCode: "2" },

    { code: "3", name: "Gastos Administrativos", type: "GASTO_ADMINISTRATIVO" },
    { code: "3.1", name: "Remuneraciones Administración", type: "GASTO_ADMINISTRATIVO", parentCode: "3" },
    { code: "3.2", name: "Arriendo Casa Matriz", type: "GASTO_ADMINISTRATIVO", parentCode: "3" },
    { code: "3.3", name: "Servicios Básicos y TI", type: "GASTO_ADMINISTRATIVO", parentCode: "3" },
    { code: "3.4", name: "Honorarios Profesionales", type: "GASTO_ADMINISTRATIVO", parentCode: "3" },

    { code: "4", name: "Impuestos", type: "IMPUESTO" },
    { code: "4.1", name: "IVA por Pagar", type: "IMPUESTO", parentCode: "4" },
    { code: "4.2", name: "Impuesto a la Renta", type: "IMPUESTO", parentCode: "4" },

    { code: "5", name: "Financiamiento", type: "FINANCIAMIENTO" },
    { code: "5.1", name: "Intereses Bancarios", type: "FINANCIAMIENTO", parentCode: "5" },
    { code: "5.2", name: "Leasing y Créditos", type: "FINANCIAMIENTO", parentCode: "5" },

    { code: "6", name: "Inversión", type: "INVERSION" },
    { code: "6.1", name: "Equipamiento Topográfico/Drones", type: "INVERSION", parentCode: "6" },
    { code: "6.2", name: "Desarrollo de Plataforma", type: "INVERSION", parentCode: "6" },

    { code: "7", name: "No Operacional", type: "NO_OPERACIONAL" },
    { code: "7.1", name: "Otros Ingresos No Operacionales", type: "NO_OPERACIONAL", parentCode: "7" },
    { code: "7.2", name: "Otros Gastos No Operacionales", type: "NO_OPERACIONAL", parentCode: "7" },
  ];

  const accountIdByCode: Record<string, string> = {};
  for (const acc of chartOfAccounts) {
    const isLeaf = chartOfAccounts.some((other) => other.parentCode === acc.code) === false;
    const created = await prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: acc.code } },
      update: {},
      create: {
        companyId: company.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        parentId: acc.parentCode ? accountIdByCode[acc.parentCode] : undefined,
        level: acc.code.split(".").length - 1,
        order: Number(acc.code.split(".").pop()),
        allowsMovements: isLeaf,
      },
    });
    accountIdByCode[acc.code] = created.id;
  }

  // Ejemplos de movimientos e ingresos/egresos de demostración.
  await prisma.movement.upsert({
    where: { id: "seed-movement-income-1" },
    update: {},
    create: {
      id: "seed-movement-income-1",
      companyId: company.id,
      type: "INGRESO",
      accountId: accountIdByCode["1.1"]!,
      description: "Servicio de inspección — ejemplo de demostración",
      grossAmount: 4500000,
      currency: "CLP",
      amountCLP: 4500000,
      bankAccountId: bankAccount.id,
      businessUnitId: businessUnits["Inspecciones"]!.id,
      projectedDate: new Date("2026-07-15"),
      status: "PROJECTED",
      origin: "MANUAL",
      createdById: admin.id,
    },
  });

  await prisma.movement.upsert({
    where: { id: "seed-movement-expense-1" },
    update: {},
    create: {
      id: "seed-movement-expense-1",
      companyId: company.id,
      type: "EGRESO",
      accountId: accountIdByCode["3.2"]!,
      description: "Arriendo Casa Matriz — ejemplo de demostración",
      grossAmount: 1200000,
      currency: "CLP",
      amountCLP: 1200000,
      bankAccountId: bankAccount.id,
      businessUnitId: businessUnits["Casa Matriz"]!.id,
      projectedDate: new Date("2026-07-05"),
      status: "PENDING",
      origin: "MANUAL",
      createdById: admin.id,
    },
  });

  await prisma.recurrenceRule.upsert({
    where: { id: "seed-recurrence-rent" },
    update: {},
    create: {
      id: "seed-recurrence-rent",
      companyId: company.id,
      type: "EGRESO",
      accountId: accountIdByCode["3.2"]!,
      description: "Arriendo mensual Casa Matriz — ejemplo de demostración",
      baseAmount: 1200000,
      currency: "CLP",
      bankAccountId: bankAccount.id,
      businessUnitId: businessUnits["Casa Matriz"]!.id,
      startDate: new Date("2026-01-05"),
      frequency: "MONTHLY",
      interval: 1,
      dayOfMonth: 5,
      initialStatus: "PROJECTED",
      active: true,
    },
  });

  console.log("Seed completado:", {
    company: company.name,
    businessUnits: Object.keys(businessUnits).length,
    accounts: chartOfAccounts.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
