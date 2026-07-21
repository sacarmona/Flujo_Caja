import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { calendarCellAmount, groupDaysByWeek, type CalendarMode, type CalendarRow } from "./calendar-view";
import type { CashFlowDay } from "./cash-flow";

const modeLabels: Record<CalendarMode, string> = {
  projected: "Proyectado",
  pending: "Pendiente",
  real: "Real",
  comparison: "Comparacion"
};

function dayLabel(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit" }).format(date);
}

function weekLabel(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit" }).format(date);
}

/**
 * Arma el .xlsx de la vista Calendario con la misma matriz cuenta x dia
 * habil que se ve en pantalla, para el Modo y filtros seleccionados. Siempre
 * incluye el detalle completo (sin categorias colapsadas): a diferencia de
 * la pantalla, el archivo descargado no tiene un estado de UI que ocultar.
 */
export async function buildCalendarExportBuffer(params: {
  rows: CalendarRow[];
  days: CashFlowDay[];
  mode: CalendarMode;
  balances: Map<string, Prisma.Decimal>;
  openingBalanceLabel: string;
  openingBalance: Prisma.Decimal;
  bankAccountName: string;
}): Promise<Buffer> {
  const { rows, days, mode, balances, openingBalanceLabel, openingBalance, bankAccountName } = params;
  const weeks = groupDaysByWeek(days);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Calendario");

  sheet.addRow(["Cuenta", bankAccountName]);
  sheet.addRow(["Modo", modeLabels[mode]]);
  sheet.addRow([openingBalanceLabel, openingBalance.toNumber()]);
  sheet.addRow([]);

  const weekHeaderRow = sheet.addRow(["Concepto"]);
  const dayHeaderRow = sheet.addRow([""]);
  let col = 2;
  for (const week of weeks) {
    const startCol = col;
    for (const day of week.days) {
      dayHeaderRow.getCell(col).value = dayLabel(day.date);
      col += 1;
    }
    const endCol = col - 1;
    weekHeaderRow.getCell(startCol).value = `Semana ${weekLabel(week.days[0].date)}`;
    if (endCol > startCol) {
      sheet.mergeCells(weekHeaderRow.number, startCol, weekHeaderRow.number, endCol);
    }
  }
  weekHeaderRow.font = { bold: true };
  dayHeaderRow.font = { bold: true };

  for (const row of rows) {
    const cells: (string | number)[] = [`${"  ".repeat(row.level)}${row.label}`];
    for (const day of days) {
      cells.push(calendarCellAmount(row, day, mode, balances).toNumber());
    }
    const sheetRow = sheet.addRow(cells);
    if (row.kind === "summary") {
      sheetRow.font = { bold: true };
    }
    for (let i = 2; i <= cells.length; i++) {
      sheetRow.getCell(i).numFmt = "#,##0";
    }
  }

  sheet.getColumn(1).width = 42;
  for (let i = 2; i <= days.length + 1; i++) {
    sheet.getColumn(i).width = 13;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
