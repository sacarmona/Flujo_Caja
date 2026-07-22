import type { PrismaClient } from "@prisma/client";
import { calendarAccumulatedBalances } from "./calendar-view";
import { calculateSantanderCashFlow } from "./cash-flow-service";
import { formatCurrency, todayInAppTimeZone } from "./format";
import { getHolidayKeys } from "./holidays-cl";
import { dateKey } from "./recurrences";

export type JarvisDailyBalanceMetric = {
  app: "flujo_caja";
  metric: "daily_balance";
  asOf: string;
  currency: "CLP";
  balance: number;
  incomeToday: number;
  expenseToday: number;
  netToday: number;
  source: "real";
  summary: string;
  byAccount: Array<{
    name: string;
    balance: number;
  }>;
};

function decimalToIntegerNumber(value: { toString(): string }): number {
  return Math.round(Number(value.toString()));
}

/**
 * Usa Modo Real (solo movimientos Parcial/Pagado-Cobrado, dinero
 * efectivamente movido) en vez del combinado Proyectado+Pendiente que usa
 * el dashboard. Reutiliza calendarAccumulatedBalances, la misma funcion que
 * usa el Calendario para Modo Real, para no duplicar la logica de acumular
 * saldo respetando saldos confirmados por el usuario.
 */
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
  const incomeToday = todayBalance?.realIncome ?? cashFlow.openingBalance.mul(0);
  const expenseToday = todayBalance?.realExpense ?? cashFlow.openingBalance.mul(0);
  const netToday = incomeToday.minus(expenseToday);

  const realBalances = calendarAccumulatedBalances(cashFlow.days, "real", cashFlow.openingBalance, cashFlow.confirmedBalances);
  const balance = realBalances.get(dateKey(today)) ?? cashFlow.openingBalance;

  return {
    app: "flujo_caja",
    metric: "daily_balance",
    asOf: asOf.toISOString(),
    currency: "CLP",
    balance: decimalToIntegerNumber(balance),
    incomeToday: decimalToIntegerNumber(incomeToday),
    expenseToday: decimalToIntegerNumber(expenseToday),
    netToday: decimalToIntegerNumber(netToday),
    source: "real",
    summary: `Saldo diario actual (Modo Real): ${formatCurrency(decimalToIntegerNumber(balance))} CLP`,
    byAccount: [
      {
        name: "Cuenta Corriente Santander",
        balance: decimalToIntegerNumber(balance)
      }
    ]
  };
}
