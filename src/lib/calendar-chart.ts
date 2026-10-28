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

/**
 * Path SVG que pasa por todos los puntos con una spline cubica monotona
 * (Fritsch-Carlson): suaviza la linea sin "rebotes" que inventen minimos o
 * maximos que no existen en los datos.
 */
export function smoothPath(coords: { x: number; y: number }[]): string {
  const n = coords.length;
  if (n === 0) return "";
  if (n === 1) return `M${coords[0].x},${coords[0].y}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(coords[i + 1].x - coords[i].x);
    slope.push(dx[i] === 0 ? 0 : (coords[i + 1].y - coords[i].y) / dx[i]);
  }

  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tangent.push(slope[n - 2]);

  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const norm = Math.hypot(a, b);
    if (norm > 3) {
      tangent[i] = (3 * a * slope[i]) / norm;
      tangent[i + 1] = (3 * b * slope[i]) / norm;
    }
  }

  let path = `M${coords[0].x},${coords[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    path += ` C${coords[i].x + h},${coords[i].y + tangent[i] * h} ${coords[i + 1].x - h},${coords[i + 1].y - tangent[i + 1] * h} ${coords[i + 1].x},${coords[i + 1].y}`;
  }
  return path;
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
