import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { buildCalendarChartPoints, niceTicks, seriesExtremes, smoothPath } from "./calendar-chart";
import type { CashFlowDay } from "./cash-flow";

function zero() {
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

function day(d: number, income: number, expense: number, balance: number): CashFlowDay {
  return {
    date: new Date(2026, 5, d),
    ...zero(),
    fullProjectedIncome: new Prisma.Decimal(income),
    fullProjectedExpense: new Prisma.Decimal(expense),
    netFlow: new Prisma.Decimal(income - expense),
    accumulatedBalance: new Prisma.Decimal(balance),
    byCategory: {},
    byAccountingAccount: {},
    byBusinessUnit: {}
  };
}

describe("calendar chart", () => {
  const days = [day(15, 100, 40, 1000), day(16, 20, 300, 720), day(17, 500, 10, 1210)];

  it("arma la serie diaria con las mismas celdas resumen que la tabla (Modo Proyectado)", () => {
    const points = buildCalendarChartPoints(days, "projected", new Map());

    expect(points.map((p) => p.date)).toEqual(["2026-06-15", "2026-06-16", "2026-06-17"]);
    expect(points.map((p) => p.income)).toEqual([100, 20, 500]);
    expect(points.map((p) => p.expense)).toEqual([40, 300, 10]);
    expect(points.map((p) => p.balance)).toEqual([1000, 720, 1210]);
  });

  it("encuentra minimo y maximo de cada serie", () => {
    const points = buildCalendarChartPoints(days, "projected", new Map());

    expect(seriesExtremes(points, "balance")).toEqual({ min: { index: 1, value: 720 }, max: { index: 2, value: 1210 } });
    expect(seriesExtremes(points, "expense")).toEqual({ min: { index: 2, value: 10 }, max: { index: 1, value: 300 } });
    expect(seriesExtremes([], "income")).toBeNull();
  });

  it("suaviza con spline monotona sin sobrepasar los puntos extremos", () => {
    const path = smoothPath([{ x: 0, y: 10 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 10 }]);

    expect(path.startsWith("M0,10 C")).toBe(true);
    expect(path.endsWith(" 30,10")).toBe(true);
    const ys = [...path.matchAll(/C([\d.]+),([-\d.]+) ([\d.]+),([-\d.]+)/g)].flatMap((m) => [Number(m[2]), Number(m[4])]);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(10);
    expect(smoothPath([])).toBe("");
  });

  it("genera marcas de eje redondas que cubren el rango", () => {
    const ticks = niceTicks(0, 1210, 5);

    expect(ticks[0]).toBeLessThanOrEqual(0);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(1210);
    expect(ticks).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(5, 5)).toEqual([5]);
  });
});
