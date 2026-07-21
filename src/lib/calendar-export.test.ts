import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { buildCalendarExportBuffer } from "./calendar-export";
import type { CashFlowDay } from "./cash-flow";
import type { CalendarRow } from "./calendar-view";

function zeroTotals() {
  return {
    projectedIncome: new Prisma.Decimal(0),
    projectedExpense: new Prisma.Decimal(0),
    pendingIncome: new Prisma.Decimal(0),
    pendingExpense: new Prisma.Decimal(0),
    realIncome: new Prisma.Decimal(0),
    realExpense: new Prisma.Decimal(0),
    fullProjectedIncome: new Prisma.Decimal(0),
    fullProjectedExpense: new Prisma.Decimal(0)
  };
}

describe("buildCalendarExportBuffer", () => {
  it("genera un .xlsx con el resumen y la matriz cuenta x dia", async () => {
    const day1: CashFlowDay = {
      date: new Date(2026, 5, 15),
      ...zeroTotals(),
      fullProjectedIncome: new Prisma.Decimal(50000),
      netFlow: new Prisma.Decimal(50000),
      accumulatedBalance: new Prisma.Decimal(150000),
      byCategory: {},
      byAccountingAccount: {},
      byBusinessUnit: {}
    };
    const day2: CashFlowDay = {
      date: new Date(2026, 5, 16),
      ...zeroTotals(),
      netFlow: new Prisma.Decimal(0),
      accumulatedBalance: new Prisma.Decimal(150000),
      byCategory: {},
      byAccountingAccount: {},
      byBusinessUnit: {}
    };
    const rows: CalendarRow[] = [{ key: "balance", label: "Saldo acumulado", kind: "summary", level: 0, summary: "balance" }];

    const buffer = await buildCalendarExportBuffer({
      rows,
      days: [day1, day2],
      mode: "projected",
      balances: new Map([
        ["2026-06-15", new Prisma.Decimal(150000)],
        ["2026-06-16", new Prisma.Decimal(150000)]
      ]),
      openingBalanceLabel: "Saldo inicial Cuenta Principal",
      openingBalance: new Prisma.Decimal(100000),
      bankAccountName: "Cuenta Principal"
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Calendario");
    expect(sheet).toBeDefined();
    expect(sheet!.getCell("A1").value).toBe("Cuenta");
    expect(sheet!.getCell("B1").value).toBe("Cuenta Principal");
    expect(sheet!.getCell("A3").value).toBe("Saldo inicial Cuenta Principal");
    expect(sheet!.getCell("B3").value).toBe(100000);
    // Fila de encabezado de dias (fila 6): dd-mm de cada dia de la semana.
    expect(sheet!.getCell("B6").value).toContain("15");
    expect(sheet!.getCell("C6").value).toContain("16");
    // Fila de la cuenta "Saldo acumulado" (fila 7): el saldo de cada dia.
    expect(sheet!.getCell("A7").value).toBe("Saldo acumulado");
    expect(sheet!.getCell("B7").value).toBe(150000);
  });
});
