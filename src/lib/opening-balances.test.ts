import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  assertCanManageOpeningBalances,
  parseOpeningBalanceAmount,
  suggestedOpeningBalanceWeek,
  weekOpeningBalance
} from "./opening-balances";
import type { CashFlowDay, CashFlowResult } from "./cash-flow";

function zero() {
  return new Prisma.Decimal(0);
}

function day(date: Date, netFlow: number, accumulatedBalance: number): CashFlowDay {
  return {
    date,
    projectedIncome: netFlow > 0 ? new Prisma.Decimal(netFlow) : zero(),
    projectedExpense: netFlow < 0 ? new Prisma.Decimal(Math.abs(netFlow)) : zero(),
    realIncome: zero(),
    realExpense: zero(),
    netFlow: new Prisma.Decimal(netFlow),
    accumulatedBalance: new Prisma.Decimal(accumulatedBalance),
    byCategory: {},
    byAccountingAccount: {},
    byBusinessUnit: {}
  };
}

describe("opening balance helpers", () => {
  it("allows ADMIN and FINANCE to manage opening balances", () => {
    expect(() => assertCanManageOpeningBalances("ADMIN")).not.toThrow();
    expect(() => assertCanManageOpeningBalances("FINANCE")).not.toThrow();
    expect(() => assertCanManageOpeningBalances("MOVEMENT_ENTRY")).toThrow("ADMIN y FINANCE");
    expect(() => assertCanManageOpeningBalances("READ_ONLY")).toThrow("ADMIN y FINANCE");
  });

  it("parses Chilean currency text including zero and negative balances", () => {
    expect(parseOpeningBalanceAmount("$5.125.657").toFixed(0)).toBe("5125657");
    expect(parseOpeningBalanceAmount("-399.000").toFixed(0)).toBe("-399000");
    expect(parseOpeningBalanceAmount("0").toFixed(0)).toBe("0");
    expect(() => parseOpeningBalanceAmount("")).toThrow("obligatorio");
  });

  it("calculates the opening balance for a later visible week", () => {
    const days = [
      day(new Date(2026, 5, 19), -399000, -399000),
      day(new Date(2026, 5, 22), 5125657, 4726657),
      day(new Date(2026, 5, 23), 0, 4726657)
    ];
    const result: CashFlowResult = {
      openingBalance: new Prisma.Decimal(0),
      days,
      weeks: []
    };

    expect(weekOpeningBalance(result, [days[1], days[2]]).toFixed(0)).toBe("-399000");
    expect(suggestedOpeningBalanceWeek(result, [{ days: [days[0]] }, { days: [days[1], days[2]] }])?.amount.toFixed(0)).toBe("-399000");
  });
});
