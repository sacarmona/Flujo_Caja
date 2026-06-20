import { Prisma } from "@prisma/client";
import type { MovementType } from "@prisma/client";
import { dateKey, isBusinessDay } from "./recurrences";
import type { CashFlowDay } from "./cash-flow";

export type PendingMovementSummary = {
  type: MovementType;
  projectedAmountClp: Prisma.Decimal | number | string;
};

function dateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function parseDashboardDate(value: string | undefined, fallback: Date): Date {
  if (!value) return dateOnly(fallback);

  const parsed = new Date(`${value}T00:00:00.000`);
  return Number.isNaN(parsed.getTime()) ? dateOnly(fallback) : dateOnly(parsed);
}

export function dateInputValue(date: Date): string {
  return dateKey(date);
}

export function monthRange(date: Date): { start: Date; end: Date } {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
  };
}

export function lastBusinessDayOfMonth(date: Date, holidayKeys: string[] = []): Date {
  const holidays = new Set(holidayKeys);
  let cursor = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  while (!isBusinessDay(cursor, holidays)) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }

  return cursor;
}

export function netPendingBalanceForMonth(movements: PendingMovementSummary[]): Prisma.Decimal {
  return movements.reduce((total, movement) => {
    const amount = new Prisma.Decimal(movement.projectedAmountClp);
    return movement.type === "INCOME" ? total.plus(amount) : total.minus(amount);
  }, new Prisma.Decimal(0));
}

export function firstNegativeBalanceDay(days: CashFlowDay[]): CashFlowDay | null {
  return days.find((day) => day.accumulatedBalance.isNegative()) ?? null;
}
