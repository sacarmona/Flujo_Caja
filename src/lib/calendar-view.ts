import { Prisma } from "@prisma/client";
import type { CashFlowDay, CashFlowGroupTotals, CashFlowResult } from "./cash-flow";
import { dateKey } from "./recurrences";

export type CalendarMode = "projected" | "real" | "comparison";

export type CalendarAccount = {
  id: string;
  name: string;
  code: string;
  parentName: string;
  parentCode: string;
};

export type CalendarRowKind = "category" | "account" | "summary";

export type CalendarRow = {
  key: string;
  label: string;
  kind: CalendarRowKind;
  level: number;
  accountId?: string;
  categoryName?: string;
  summary?: "income" | "expense" | "net" | "balance";
};

export function calendarMonths(value?: string | number): 3 | 6 | 9 | 12 {
  const parsed = Number(value);
  return parsed === 6 || parsed === 9 || parsed === 12 ? parsed : 3;
}

export function calendarMode(value?: string): CalendarMode {
  return value === "real" || value === "comparison" ? value : "projected";
}

/**
 * Clave del lunes de la semana de una fecha. No se puede agrupar buscando
 * directamente un dia con getDay() === 1 porque `days` solo contiene dias
 * habiles: si el lunes de una semana es feriado (ej. 29-06-2026, San Pedro y
 * San Pablo) no aparece en la lista y la semana siguiente quedaria mezclada
 * con la anterior.
 */
function mondayKey(date: Date): string {
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return dateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + diffToMonday));
}

export function groupDaysByWeek(days: CashFlowDay[]) {
  const weeks: { key: string; days: CashFlowDay[] }[] = [];

  for (const day of days) {
    const key = mondayKey(day.date);
    const last = weeks.at(-1);
    if (last && last.key === key) {
      last.days.push(day);
    } else {
      weeks.push({ key, days: [day] });
    }
  }

  return weeks;
}

export function buildCalendarRows(accounts: CalendarAccount[], collapsedCategories: Set<string> = new Set()): CalendarRow[] {
  const rows: CalendarRow[] = [];
  const categoryCodes = new Map<string, string>();
  for (const account of accounts) {
    if (!categoryCodes.has(account.parentName)) {
      categoryCodes.set(account.parentName, account.parentCode);
    }
  }
  const categories = [...categoryCodes.keys()].sort((a, b) =>
    categoryCodes.get(a)!.localeCompare(categoryCodes.get(b)!, "es-CL", { numeric: true })
  );

  for (const category of categories) {
    rows.push({ key: `category:${category}`, label: category, kind: "category", level: 0, categoryName: category });

    if (!collapsedCategories.has(category)) {
      for (const account of accounts.filter((item) => item.parentName === category).sort((a, b) => a.code.localeCompare(b.code, "es-CL"))) {
        rows.push({
          key: `account:${account.id}`,
          label: `${account.code} - ${account.name}`,
          kind: "account",
          level: 1,
          accountId: account.id,
          categoryName: category
        });
      }
    }
  }

  rows.push({ key: "summary:income", label: "Total ingresos", kind: "summary", level: 0, summary: "income" });
  rows.push({ key: "summary:expense", label: "Total egresos", kind: "summary", level: 0, summary: "expense" });
  rows.push({ key: "summary:net", label: "Flujo neto", kind: "summary", level: 0, summary: "net" });
  rows.push({ key: "summary:balance", label: "Saldo acumulado", kind: "summary", level: 0, summary: "balance" });

  return rows;
}

function modeAmount(totals: CashFlowGroupTotals, mode: CalendarMode, type: "income" | "expense") {
  if (type === "income") {
    if (mode === "projected") return totals.fullProjectedIncome;
    if (mode === "real") return totals.realIncome;
    return totals.projectedIncome.plus(totals.realIncome);
  }

  if (mode === "projected") return totals.fullProjectedExpense;
  if (mode === "real") return totals.realExpense;
  return totals.projectedExpense.plus(totals.realExpense);
}

/** Flujo neto del dia segun el modo seleccionado (Proyectado: pronostico completo; Real: solo lo cobrado/pagado/pendiente; Comparacion: combinado mutuamente excluyente). */
function calendarNetFlow(day: CashFlowDay, mode: CalendarMode): Prisma.Decimal {
  if (mode === "projected") return day.fullProjectedIncome.minus(day.fullProjectedExpense);
  if (mode === "real") return day.realIncome.minus(day.realExpense);
  return day.netFlow;
}

/**
 * Saldo acumulado por dia segun el modo seleccionado: se recalcula sumando
 * el flujo neto del modo a partir del saldo inicial, en vez de usar siempre
 * el saldo combinado (mutuamente excluyente) que calcula calculateCashFlowByBusinessDay.
 *
 * Si una semana tiene un saldo confirmado/actualizado por el usuario
 * (confirmedBalances), se usa ese como saldo inicial de esa semana en
 * adelante; si no, se sigue acumulando por defecto el saldo calculado.
 */
export function calendarAccumulatedBalances(
  days: CashFlowDay[],
  mode: CalendarMode,
  openingBalance: Prisma.Decimal,
  confirmedBalances: Map<string, Prisma.Decimal> = new Map()
): Map<string, Prisma.Decimal> {
  const balances = new Map<string, Prisma.Decimal>();
  let accumulated = openingBalance;
  for (const day of days) {
    const confirmed = confirmedBalances.get(dateKey(day.date));
    if (confirmed) {
      accumulated = confirmed;
    }
    accumulated = accumulated.plus(calendarNetFlow(day, mode));
    balances.set(dateKey(day.date), accumulated);
  }
  return balances;
}

export function calendarCellAmount(
  row: CalendarRow,
  day: CashFlowDay,
  mode: CalendarMode,
  balances?: Map<string, Prisma.Decimal>
): Prisma.Decimal {
  if (row.kind === "category" && row.categoryName) {
    const totals = day.byCategory[row.categoryName];
    return totals ? modeAmount(totals, mode, "income").minus(modeAmount(totals, mode, "expense")) : new Prisma.Decimal(0);
  }

  if (row.kind === "account") {
    const accountName = row.label.replace(/^[^-]+ - /, "");
    const totals = day.byAccountingAccount[accountName];
    return totals ? modeAmount(totals, mode, "income").minus(modeAmount(totals, mode, "expense")) : new Prisma.Decimal(0);
  }

  if (row.summary === "income") {
    return modeAmount(day, mode, "income");
  }

  if (row.summary === "expense") {
    return modeAmount(day, mode, "expense");
  }

  if (row.summary === "net") {
    return calendarNetFlow(day, mode);
  }

  if (row.summary === "balance") {
    return balances?.get(dateKey(day.date)) ?? day.accumulatedBalance;
  }

  return new Prisma.Decimal(0);
}

export function movementCellHref(params: {
  date: Date;
  accountId?: string;
  type?: "INCOME" | "EXPENSE";
}) {
  const search = new URLSearchParams({
    from: dateKey(params.date),
    to: dateKey(params.date)
  });

  if (params.accountId) search.set("accountingAccountId", params.accountId);
  if (params.type) search.set("type", params.type);

  return `/app/movimientos?${search.toString()}`;
}

export function calendarStatusToken(row: CalendarRow, amount: Prisma.Decimal) {
  if (row.summary === "balance") return amount.isNegative() ? "alerta saldo negativo" : "saldo";
  if (amount.isZero()) return "sin movimiento";
  if (amount.isPositive()) return "ingreso pendiente/pagado";
  return "egreso pendiente/pagado";
}

export function hasCalendarData(result: CashFlowResult) {
  return result.days.some((day) => !day.netFlow.isZero() || !day.accumulatedBalance.eq(result.openingBalance));
}
