// Carga los proveedores con deuda historica (tabla Excel del usuario) en la
// tabla Vendor. Es idempotente: usa upsert por (companyId, category, name)
// asi que se puede correr varias veces sin duplicar filas.
//
// Uso:
//   DATABASE_URL="postgresql://...produccion..." node scripts/seed-vendors.mjs
//   (o simplemente `node scripts/seed-vendors.mjs` si tu .env local ya
//   apunta a la base que quieres cargar)
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const companyName = "ADENTU Ingeniería SpA";

// Montos siempre positivos (el sistema los trata como "monto adeudado", sin
// signo). dueDay null cuando el Excel no informaba un dia (ej. B. Chile 02).
const vendors = [
  { category: "PP proveedores", name: "Silvotec", referenceInstallment: "4498109", dueDay: 15, initialDebtClp: "38835507" },
  { category: "PP proveedores", name: "Grenke", referenceInstallment: "1691109", dueDay: 5, initialDebtClp: "38895507" },
  { category: "PP proveedores", name: "PP Avis 01", referenceInstallment: "2763549", dueDay: 31, initialDebtClp: "103007110" },
  { category: "PP proveedores", name: "PP Avis 02", referenceInstallment: "2568578", dueDay: 31, initialDebtClp: "10842890" },
  { category: "Financieras/bancos", name: "B. Chile 01", referenceInstallment: "127153", dueDay: 4, initialDebtClp: "6357650" },
  { category: "Financieras/bancos", name: "B. Chile 02", referenceInstallment: "1013480", dueDay: null, initialDebtClp: "50674000" },
  { category: "Financieras/bancos", name: "B. Santander", referenceInstallment: "1096989", dueDay: 25, initialDebtClp: "3290967" },
  { category: "TGR", name: "TGR - 242941", referenceInstallment: "723984", dueDay: 31, initialDebtClp: "12307728" },
  { category: "TGR", name: "TGR - 255207", referenceInstallment: "496632", dueDay: 31, initialDebtClp: "8442744" },
  { category: "TGR", name: "TGR - 9245", referenceInstallment: "7864178", dueDay: 31, initialDebtClp: "133691020" },
  { category: "TGR", name: "TGR - 35430", referenceInstallment: "1112932", dueDay: 31, initialDebtClp: "18919844" }
];

async function main() {
  const company = await prisma.company.findUnique({ where: { name: companyName } });
  if (!company) {
    throw new Error(`No existe la empresa "${companyName}" en esta base de datos.`);
  }

  for (const vendor of vendors) {
    // No hay constraint unico (companyId, category, name) en el schema, asi
    // que la idempotencia se resuelve a mano: busca por esos 3 campos antes
    // de decidir crear o actualizar.
    const existing = await prisma.vendor.findFirst({
      where: { companyId: company.id, category: vendor.category, name: vendor.name }
    });

    const data = {
      referenceInstallment: new Prisma.Decimal(vendor.referenceInstallment),
      dueDay: vendor.dueDay,
      initialDebtClp: new Prisma.Decimal(vendor.initialDebtClp),
      deletedAt: null,
      isActive: true
    };

    const saved = existing
      ? await prisma.vendor.update({ where: { id: existing.id }, data })
      : await prisma.vendor.create({ data: { companyId: company.id, category: vendor.category, name: vendor.name, ...data } });

    console.log(`OK: ${saved.category} / ${saved.name} -> total ${saved.initialDebtClp.toString()}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
