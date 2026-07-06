import type { PrismaClient } from "@prisma/client";
import type { CashFlowFilters } from "./cash-flow";
import { calculateCashFlowByBusinessDay } from "./cash-flow";

export async function calculateSantanderCashFlow(params: {
  prisma: PrismaClient;
  companyId: string;
  startDate: Date;
  endDate?: Date;
  months?: number;
  holidays?: string[];
  filters?: CashFlowFilters;
}) {
  const bankAccount = await params.prisma.bankAccount.findFirst({
    where: {
      companyId: params.companyId,
      name: "Cuenta Corriente Santander",
      deletedAt: null
    }
  });

  if (!bankAccount) {
    throw new Error("No existe Cuenta Corriente Santander.");
  }

  const [openingBalances, movements] = await Promise.all([
    params.prisma.openingBalance.findMany({
      where: {
        companyId: params.companyId,
        bankAccountId: bankAccount.id,
        deletedAt: null
      }
    }),
    params.prisma.movement.findMany({
      where: {
        companyId: params.companyId,
        bankAccountId: bankAccount.id,
        deletedAt: null,
        ...(params.filters?.businessUnitId ? { businessUnitId: params.filters.businessUnitId } : {}),
        ...(params.filters?.accountingAccountId ? { accountingAccountId: params.filters.accountingAccountId } : {}),
        ...(Array.isArray(params.filters?.status)
          ? params.filters.status.length > 0
            ? { status: { in: params.filters.status } }
            : {}
          : params.filters?.status
            ? { status: params.filters.status }
            : {}),
        ...(params.filters?.type ? { type: params.filters.type } : {}),
        ...(params.filters?.currency ? { currency: params.filters.currency } : {})
      },
      include: {
        accountingAccount: {
          include: {
            parent: true
          }
        },
        businessUnit: true,
        payments: true
      }
    })
  ]);

  return calculateCashFlowByBusinessDay(movements, openingBalances, {
    startDate: params.startDate,
    endDate: params.endDate,
    months: params.months ?? 3,
    holidays: params.holidays,
    filters: params.filters
  });
}
