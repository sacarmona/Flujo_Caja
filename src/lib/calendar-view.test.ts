import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildCalendarRows,
  calendarAccumulatedBalances,
  calendarCellAmount,
  calendarMode,
  calendarMonths,
  groupDaysByWeek,
  movementCellHref,
  weeklyAccumulatedBalances,
  type CalendarAccount
} from "./calendar-view";
import type { CashFlowDay } from "./cash-flow";
import { weekKeyOf } from "./iso-week";

const accounts: CalendarAccount[] = [
  { id: "income", code: "1.01", name: "Servicios", parentName: "Ingresos", parentCode: "1" },
  { id: "expense", code: "3.01", name: "Software", parentName: "Gastos administrativos", parentCode: "3" }
];

function zero() {
  return new Prisma.Decimal(0);
}

function day(overrides: Partial<CashFlowDay> = {}): CashFlowDay {
  return {
    date: new Date(2026, 5, 15),
    projectedIncome: new Prisma.Decimal(100),
    projectedExpense: new Prisma.Decimal(40),
    realIncome: new Prisma.Decimal(80),
    realExpense: new Prisma.Decimal(20),
    fullProjectedIncome: new Prisma.Decimal(150),
    fullProjectedExpense: new Prisma.Decimal(60),
    netFlow: new Prisma.Decimal(120),
    accumulatedBalance: new Prisma.Decimal(1000),
    byCategory: {
      Ingresos: {
        projectedIncome: new Prisma.Decimal(100),
        projectedExpense: zero(),
        realIncome: new Prisma.Decimal(80),
        realExpense: zero(),
        fullProjectedIncome: new Prisma.Decimal(130),
        fullProjectedExpense: zero()
      }
    },
    byAccountingAccount: {
      Servicios: {
        projectedIncome: new Prisma.Decimal(100),
        projectedExpense: zero(),
        realIncome: new Prisma.Decimal(80),
        realExpense: zero(),
        fullProjectedIncome: new Prisma.Decimal(130),
        fullProjectedExpense: zero()
      }
    },
    byBusinessUnit: {},
    ...overrides
  };
}

describe("calendar view helpers", () => {
  it("normalizes range and mode selectors", () => {
    expect(calendarMonths("3")).toBe(3);
    expect(calendarMonths("6")).toBe(6);
    expect(calendarMonths("9")).toBe(9);
    expect(calendarMonths("12")).toBe(12);
    expect(calendarMonths("24")).toBe(3);
    expect(calendarMode("real")).toBe("real");
    expect(calendarMode("comparison")).toBe("comparison");
    expect(calendarMode("bad")).toBe("projected");
  });

  it("builds collapsible hierarchical rows", () => {
    const open = buildCalendarRows(accounts);
    const collapsed = buildCalendarRows(accounts, new Set(["Ingresos"]));

    expect(open.some((row) => row.key === "account:income")).toBe(true);
    expect(collapsed.some((row) => row.key === "account:income")).toBe(false);
    expect(collapsed.some((row) => row.key === "summary:balance")).toBe(true);
  });

  it("calculates projected, real and comparison cell values", () => {
    const row = buildCalendarRows(accounts).find((item) => item.key === "category:Ingresos");
    if (!row) throw new Error("Missing row");

    expect(calendarCellAmount(row, day(), "projected").toString()).toBe("130");
    expect(calendarCellAmount(row, day(), "real").toString()).toBe("80");
    expect(calendarCellAmount(row, day(), "comparison").toString()).toBe("180");
  });

  it("calculates net flow per mode using fullProjected/real totals", () => {
    const netRow = buildCalendarRows(accounts).find((item) => item.key === "summary:net");
    if (!netRow) throw new Error("Missing row");

    expect(calendarCellAmount(netRow, day(), "projected").toString()).toBe("90");
    expect(calendarCellAmount(netRow, day(), "real").toString()).toBe("60");
    expect(calendarCellAmount(netRow, day(), "comparison").toString()).toBe("120");
  });

  it("recalculates accumulated balance per mode instead of using the combined total", () => {
    const balanceRow = buildCalendarRows(accounts).find((item) => item.key === "summary:balance");
    if (!balanceRow) throw new Error("Missing row");

    const days = [day(), day({ date: new Date(2026, 5, 16) })];
    const projectedBalances = calendarAccumulatedBalances(days, "projected", new Prisma.Decimal(1000));
    const realBalances = calendarAccumulatedBalances(days, "real", new Prisma.Decimal(1000));

    expect(calendarCellAmount(balanceRow, days[1], "projected", projectedBalances).toString()).toBe("1180");
    expect(calendarCellAmount(balanceRow, days[1], "real", realBalances).toString()).toBe("1120");
    expect(calendarCellAmount(balanceRow, days[1], "comparison").toString()).toBe("1000");
  });

  it("usa el saldo confirmado/actualizado para la semana en vez del calculado, una vez presente", () => {
    const balanceRow = buildCalendarRows(accounts).find((item) => item.key === "summary:balance");
    if (!balanceRow) throw new Error("Missing row");

    const days = [day(), day({ date: new Date(2026, 5, 16) })];
    const confirmedBalances = new Map([["2026-06-16", new Prisma.Decimal(5000)]]);
    const balances = calendarAccumulatedBalances(days, "projected", new Prisma.Decimal(1000), confirmedBalances);

    expect(calendarCellAmount(balanceRow, days[1], "projected", balances).toString()).toBe("5090");
  });

  it("indexa el saldo acumulado por semana, dejando el saldo del ultimo dia habil de cada semana", () => {
    // Lunes 15-jun y martes 16-jun (misma semana ISO), luego lunes 22-jun (semana siguiente).
    const days = [day({ date: new Date(2026, 5, 15) }), day({ date: new Date(2026, 5, 16) }), day({ date: new Date(2026, 5, 22) })];
    const weekly = weeklyAccumulatedBalances(days, "projected", new Prisma.Decimal(1000), new Map(), weekKeyOf);

    expect(weekly.size).toBe(2);
    expect(weekly.get(weekKeyOf(new Date(2026, 5, 16)))?.toString()).toBe("1180");
    expect(weekly.get(weekKeyOf(new Date(2026, 5, 22)))?.toString()).toBe("1270");
  });

  it("builds links to movement filters by date and account", () => {
    expect(movementCellHref({ date: new Date(2026, 5, 15), accountId: "income" })).toBe(
      "/app/movimientos?from=2026-06-15&to=2026-06-15&accountingAccountId=income"
    );
  });

  it("groups days by Monday-start weeks", () => {
    const weeks = groupDaysByWeek([
      day({ date: new Date(2026, 5, 15) }),
      day({ date: new Date(2026, 5, 16) }),
      day({ date: new Date(2026, 5, 22) })
    ]);

    expect(weeks).toHaveLength(2);
    expect(weeks[0].days).toHaveLength(2);
  });

  it("inicia una semana nueva aunque el lunes sea feriado y no aparezca en los dias habiles", () => {
    const weeks = groupDaysByWeek([
      day({ date: new Date(2026, 5, 26) }), // viernes, semana del 22-06
      day({ date: new Date(2026, 5, 30) }), // martes, semana del 29-06 (lunes 29 es feriado)
      day({ date: new Date(2026, 6, 1) })
    ]);

    expect(weeks).toHaveLength(2);
    expect(weeks[0].days).toHaveLength(1);
    expect(weeks[1].days).toHaveLength(2);
  });
});
