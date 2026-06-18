import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildCalendarRows,
  calendarCellAmount,
  calendarMode,
  calendarMonths,
  groupDaysByWeek,
  movementCellHref,
  type CalendarAccount
} from "./calendar-view";
import type { CashFlowDay } from "./cash-flow";

const accounts: CalendarAccount[] = [
  { id: "income", code: "1.01", name: "Servicios", parentName: "Ingresos" },
  { id: "expense", code: "3.01", name: "Software", parentName: "Gastos administrativos" }
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
    netFlow: new Prisma.Decimal(120),
    accumulatedBalance: new Prisma.Decimal(1000),
    byCategory: {
      Ingresos: {
        projectedIncome: new Prisma.Decimal(100),
        projectedExpense: zero(),
        realIncome: new Prisma.Decimal(80),
        realExpense: zero()
      }
    },
    byAccountingAccount: {
      Servicios: {
        projectedIncome: new Prisma.Decimal(100),
        projectedExpense: zero(),
        realIncome: new Prisma.Decimal(80),
        realExpense: zero()
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

    expect(calendarCellAmount(row, day(), "projected").toString()).toBe("100");
    expect(calendarCellAmount(row, day(), "real").toString()).toBe("80");
    expect(calendarCellAmount(row, day(), "comparison").toString()).toBe("180");
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
});
