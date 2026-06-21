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
    fullProjectedIncome: netFlow > 0 ? new Prisma.Decimal(netFlow) : zero(),
    fullProjectedExpense: netFlow < 0 ? new Prisma.Decimal(Math.abs(netFlow)) : zero(),
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

  it("parses montos con coma decimal sin confundirla con separador de miles", () => {
    expect(parseOpeningBalanceAmount("619181,00").toFixed(0)).toBe("619181");
    expect(parseOpeningBalanceAmount("619181,37").toFixed(2)).toBe("619181.37");
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
      weeks: [],
      confirmedBalances: new Map()
    };

    expect(weekOpeningBalance(result, [days[1], days[2]]).toFixed(0)).toBe("-399000");
    expect(suggestedOpeningBalanceWeek(result, [{ days: [days[0]] }, { days: [days[1], days[2]] }])?.amount.toFixed(0)).toBe("-399000");
  });

  it("sugiere la siguiente semana sin confirmar, no la primera, una vez que esa ya se confirmo", () => {
    // Semana 26 (22-jun, lunes) ya confirmada en 619181; semana 27 (29-jun, lunes) todavia no.
    const days = [
      day(new Date(2026, 5, 19), -399000, -399000), // viernes, semana 25 (sin lunes visible)
      day(new Date(2026, 5, 22), 0, 619181), // lunes semana 26: el loop de calculateCashFlowByBusinessDay ya aplico el confirmado aqui
      day(new Date(2026, 5, 26), 100000, 719181), // viernes semana 26
      day(new Date(2026, 5, 29), 0, 719181) // lunes semana 27, aun sin confirmar
    ];
    const result: CashFlowResult = {
      openingBalance: new Prisma.Decimal(1046293),
      days,
      weeks: [],
      confirmedBalances: new Map([["2026-06-22", new Prisma.Decimal(619181)]])
    };
    const weeks = [{ days: [days[0]] }, { days: [days[1], days[2]] }, { days: [days[3]] }];

    const suggested = suggestedOpeningBalanceWeek(result, weeks);

    expect(suggested?.date.getTime()).toBe(days[3].date.getTime());
    expect(suggested?.amount.toFixed(0)).toBe("719181");
  });

  it("si todas las semanas visibles ya estan confirmadas, sugiere la ultima en vez de volver a la primera", () => {
    const days = [day(new Date(2026, 5, 22), 0, 619181), day(new Date(2026, 5, 29), 0, 800000)];
    const result: CashFlowResult = {
      openingBalance: new Prisma.Decimal(0),
      days,
      weeks: [],
      confirmedBalances: new Map([
        ["2026-06-22", new Prisma.Decimal(619181)],
        ["2026-06-29", new Prisma.Decimal(800000)]
      ])
    };
    const weeks = [{ days: [days[0]] }, { days: [days[1]] }];

    const suggested = suggestedOpeningBalanceWeek(result, weeks);

    expect(suggested?.date.getTime()).toBe(days[1].date.getTime());
  });
});
