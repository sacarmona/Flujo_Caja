import type { Prisma } from "@prisma/client";
import { calendarCellAmount, type CalendarMode, type CalendarRow } from "./calendar-view";
import type { CashFlowDay } from "./cash-flow";
import { dateKey } from "./recurrences";

export type CalendarChartPoint = {
  /** yyyy-mm-dd del dia habil. */
  date: string;
  income: number;
  expense: number;
  balance: number;
};

export type ChartSeriesKey = "income" | "expense" | "balance";

export type SeriesExtremes = {
  min: { index: number; value: number };
  max: { index: number; value: number };
};

const summaryRows: Record<ChartSeriesKey, CalendarRow> = {
  income: { key: "summary:income", label: "Total ingresos", kind: "summary", level: 0, summary: "income" },
  expense: { key: "summary:expense", label: "Total egresos", kind: "summary", level: 0, summary: "expense" },
  balance: { key: "summary:balance", label: "Saldo acumulado", kind: "summary", level: 0, summary: "balance" }
};

/**
 * Serie diaria para el grafico: usa exactamente las mismas celdas resumen
 * que la tabla del Calendario (Total ingresos, Total egresos, Saldo
 * acumulado) para el Modo seleccionado, asi el grafico nunca difiere de lo
 * que se ve en la grilla.
 */
export function buildCalendarChartPoints(
  days: CashFlowDay[],
  mode: CalendarMode,
  balances: Map<string, Prisma.Decimal>
): CalendarChartPoint[] {
  return days.map((day) => ({
    date: dateKey(day.date),
    income: calendarCellAmount(summaryRows.income, day, mode, balances).toNumber(),
    expense: calendarCellAmount(summaryRows.expense, day, mode, balances).toNumber(),
    balance: calendarCellAmount(summaryRows.balance, day, mode, balances).toNumber()
  }));
}

/** Minimo y maximo de una serie (primera ocurrencia si hay empates); null si no hay puntos. */
export function seriesExtremes(points: CalendarChartPoint[], key: ChartSeriesKey): SeriesExtremes | null {
  if (points.length === 0) return null;

  let min = { index: 0, value: points[0][key] };
  let max = { index: 0, value: points[0][key] };
  points.forEach((point, index) => {
    if (point[key] < min.value) min = { index, value: point[key] };
    if (point[key] > max.value) max = { index, value: point[key] };
  });
  return { min, max };
}

/** Marcas "redondas" para un eje: ~count intervalos entre min y max, con paso 1/2/5 x 10^n. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) return [min];

  const rawStep = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;

  const ticks: number[] = [];
  // Hasta el primer valor >= max, para que las marcas siempre cubran todo el rango.
  for (let value = Math.floor(min / step) * step; ; value += step) {
    ticks.push(Math.round(value));
    if (value >= max) break;
  }
  return ticks;
}
