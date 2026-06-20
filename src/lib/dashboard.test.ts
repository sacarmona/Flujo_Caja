import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  firstNegativeBalanceDay,
  lastBusinessDayOfMonth,
  monthRange,
  netPendingBalanceForMonth,
  parseDashboardDate,
  upcomingWeeklySummaries
} from "./dashboard";
import { dateKey } from "./recurrences";
import { calculateCashFlowByBusinessDay, type CashFlowDay } from "./cash-flow";

const incomeAccount = { id: "acc-income", name: "Servicios", code: "1.01", parent: { id: "cat-income", name: "Ingresos" } };
const expenseAccount = { id: "acc-expense", name: "Software", code: "3.05", parent: { id: "cat-admin", name: "Gastos administrativos" } };
const unit = { id: "unit-ops", name: "Inspecciones" };

const baseMovement = {
  status: "PENDING" as const,
  currency: "CLP" as const,
  deletedAt: null,
  cancelledAt: null,
  payments: []
};

function isoDate(value: string) {
  return new Date(`${value}T00:00:00.000`);
}

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

  it("summarizes upcoming weeks with income, expense, net flow and ending balance", () => {
    const result = calculateCashFlowByBusinessDay(
      [
        {
          ...baseMovement,
          id: "income-week1",
          type: "INCOME" as const,
          projectedDate: isoDate("2026-06-15"),
          projectedAmountClp: "10000",
          accountingAccountId: incomeAccount.id,
          businessUnitId: unit.id,
          accountingAccount: incomeAccount,
          businessUnit: unit
        },
        {
          ...baseMovement,
          id: "expense-week1",
          type: "EXPENSE" as const,
          projectedDate: isoDate("2026-06-17"),
          projectedAmountClp: "4000",
          accountingAccountId: expenseAccount.id,
          businessUnitId: unit.id,
          accountingAccount: expenseAccount,
          businessUnit: unit
        },
        {
          ...baseMovement,
          id: "income-week2",
          type: "INCOME" as const,
          projectedDate: isoDate("2026-06-22"),
          projectedAmountClp: "5000",
          accountingAccountId: incomeAccount.id,
          businessUnitId: unit.id,
          accountingAccount: incomeAccount,
          businessUnit: unit
        }
      ],
      [],
      { startDate: isoDate("2026-06-15"), endDate: isoDate("2026-06-26") }
    );

    const summaries = upcomingWeeklySummaries(result, 4);

    expect(summaries).toHaveLength(2);
    expect(summaries[0].income.toString()).toBe("10000");
    expect(summaries[0].expense.toString()).toBe("4000");
    expect(summaries[0].netFlow.toString()).toBe("6000");
    expect(summaries[0].endingBalance.toString()).toBe("6000");
    expect(summaries[1].income.toString()).toBe("5000");
    expect(summaries[1].netFlow.toString()).toBe("5000");
    expect(summaries[1].endingBalance.toString()).toBe("11000");
  });

  it("limits the number of weeks returned", () => {
    const result = calculateCashFlowByBusinessDay([], [], { startDate: isoDate("2026-06-15"), endDate: isoDate("2026-07-10") });

    expect(upcomingWeeklySummaries(result, 2)).toHaveLength(2);
  });
});
