import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  firstNegativeBalanceDay,
  lastBusinessDayOfMonth,
  monthRange,
  netPendingBalanceForMonth,
  parseDashboardDate
} from "./dashboard";
import { dateKey } from "./recurrences";
import type { CashFlowDay } from "./cash-flow";

function zero() {
  return new Prisma.Decimal(0);
}

function day(date: Date, accumulatedBalance: number): CashFlowDay {
  return {
    date,
    projectedIncome: zero(),
    projectedExpense: zero(),
    realIncome: zero(),
    realExpense: zero(),
    fullProjectedIncome: zero(),
    fullProjectedExpense: zero(),
    netFlow: zero(),
    accumulatedBalance: new Prisma.Decimal(accumulatedBalance),
    byCategory: {},
    byAccountingAccount: {},
    byBusinessUnit: {}
  };
}

describe("dashboard helpers", () => {
  it("uses the last business day of the month by default", () => {
    expect(lastBusinessDayOfMonth(new Date(2026, 5, 19), ["2026-06-29"]).toISOString().slice(0, 10)).toBe("2026-06-30");
    expect(lastBusinessDayOfMonth(new Date(2026, 0, 10), ["2026-01-30"]).toISOString().slice(0, 10)).toBe("2026-01-29");
  });

  it("parses editable target dates with fallback", () => {
    const fallback = new Date(2026, 5, 30);

    expect(parseDashboardDate("2026-07-15", fallback).toISOString().slice(0, 10)).toBe("2026-07-15");
    expect(parseDashboardDate("fecha-mala", fallback).toISOString().slice(0, 10)).toBe("2026-06-30");
  });

  it("returns current month range", () => {
    const range = monthRange(new Date(2026, 5, 19));

    expect(dateKey(range.start)).toBe("2026-06-01");
    expect(dateKey(range.end)).toBe("2026-06-30");
  });

  it("calculates net pending balance for the month", () => {
    expect(
      netPendingBalanceForMonth([
        { type: "INCOME", projectedAmountClp: "1200000" },
        { type: "EXPENSE", projectedAmountClp: "350000" }
      ]).toString()
    ).toBe("850000");
  });

  it("finds the first day where the accumulated balance turns negative", () => {
    const days = [
      day(new Date(2026, 5, 19), 619181),
      day(new Date(2026, 5, 22), -100000),
      day(new Date(2026, 5, 23), -50000)
    ];

    const negativeDay = firstNegativeBalanceDay(days);

    expect(negativeDay?.date).toEqual(new Date(2026, 5, 22));
    expect(negativeDay?.accumulatedBalance.toString()).toBe("-100000");
  });

  it("returns null when no day has a negative balance", () => {
    const days = [day(new Date(2026, 5, 19), 619181), day(new Date(2026, 5, 22), 1000)];

    expect(firstNegativeBalanceDay(days)).toBeNull();
  });
});
