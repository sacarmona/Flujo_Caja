import type { PrismaClient } from "@prisma/client";
import { calculateSantanderCashFlow } from "./cash-flow-service";
import { formatCurrency, todayInAppTimeZone } from "./format";
import { getHolidayKeys } from "./holidays-cl";

export type JarvisDailyBalanceMetric = {
  app: "flujo_caja";
  metric: "daily_balance";
  asOf: string;
  currency: "CLP";
  balance: number;
  incomeToday: number;
  expenseToday: number;
  netToday: number;
  source: "dashboard";
  summary: string;
  byAccount: Array<{
    name: string;
    balance: number;
  }>;
};

function decimalToIntegerNumber(value: { toString(): string }): number {
  return Math.round(Number(value.toString()));
}

export async function getJarvisDailyBalanceMetric(prisma: PrismaClient, asOf = new Date()): Promise<JarvisDailyBalanceMetric> {
  const company = await prisma.company.findFirst({ select: { id: true } });
  if (!company) {
    throw new Error("No existe empresa configurada.");
  }

  const today = todayInAppTimeZone();
  const holidays = await getHolidayKeys(prisma);
  const cashFlow = await calculateSantanderCashFlow({
    prisma,
    companyId: company.id,
    startDate: today,
    endDate: today,
    holidays
  });
  const todayBalance = cashFlow.days.at(-1);
  const balance = todayBalance?.accumulatedBalance ?? cashFlow.openingBalance;
  const incomeToday = todayBalance ? todayBalance.projectedIncome.plus(todayBalance.pendingIncome) : cashFlow.openingBalance.mul(0);
  const expenseToday = todayBalance ? todayBalance.projectedExpense.plus(todayBalance.pendingExpense) : cashFlow.openingBalance.mul(0);
  const netToday = todayBalance?.netFlow ?? cashFlow.openingBalance.mul(0);

  return {
    app: "flujo_caja",
    metric: "daily_balance",
    asOf: asOf.toISOString(),
    currency: "CLP",
    balance: decimalToIntegerNumber(balance),
    incomeToday: decimalToIntegerNumber(incomeToday),
    expenseToday: decimalToIntegerNumber(expenseToday),
    netToday: decimalToIntegerNumber(netToday),
    source: "dashboard",
    summary: `Saldo diario actual: ${formatCurrency(decimalToIntegerNumber(balance))} CLP`,
    byAccount: [
      {
        name: "Cuenta Corriente Santander",
        balance: decimalToIntegerNumber(balance)
      }
    ]
  };
}
