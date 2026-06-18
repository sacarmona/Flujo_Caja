import { describe, expect, it } from "vitest";
import { BusinessCalendar } from "../calendar/business-calendar";
import { dateOnlyUTC, toISODate } from "../calendar/date-utils";
import { dedupeOccurrences, generateOccurrences } from "./engine";
import type { RecurrenceConfig } from "./types";

const calendar = new BusinessCalendar();

function isoDates(results: { scheduledDate: Date }[]): string[] {
  return results.map((r) => toISODate(r.scheduledDate));
}

describe("motor de recurrencias — meses de distinta duración", () => {
  it("mensual día 31 cae en febrero (28 días) usa el último día del mes", () => {
    const config: RecurrenceConfig = {
      ruleId: "r1",
      startDate: dateOnlyUTC(2025, 1, 31),
      frequency: "MONTHLY",
      dayOfMonth: 31,
      baseAmount: 1000,
    };
    const results = generateOccurrences(
      config,
      calendar,
      dateOnlyUTC(2025, 1, 1),
      dateOnlyUTC(2025, 4, 30),
    );
    const rawIso = results.map((r) => toISODate(r.rawDate));
    expect(rawIso).toContain("2025-01-31");
    expect(rawIso).toContain("2025-02-28"); // febrero no bisiesto: 28 días
    expect(rawIso).toContain("2025-03-31");
  });

  it("mensual día 31 en abril (30 días) usa el día 30", () => {
    const config: RecurrenceConfig = {
      ruleId: "r2",
      startDate: dateOnlyUTC(2025, 3, 31),
      frequency: "MONTHLY",
      dayOfMonth: 31,
      baseAmount: 500,
    };
    const results = generateOccurrences(
      config,
      calendar,
      dateOnlyUTC(2025, 3, 1),
      dateOnlyUTC(2025, 4, 30),
    );
    const aprilOccurrence = results.find((r) => r.rawDate.getUTCMonth() === 3);
    expect(aprilOccurrence && toISODate(aprilOccurrence.rawDate)).toBe("2025-04-30");
  });
});

describe("motor de recurrencias — años bisiestos", () => {
  it("febrero 2028 (bisiesto) usa el día 29 para dayOfMonth 29", () => {
    const config: RecurrenceConfig = {
      ruleId: "r3",
      startDate: dateOnlyUTC(2028, 1, 29),
      frequency: "MONTHLY",
      dayOfMonth: 29,
      baseAmount: 100,
    };
    const results = generateOccurrences(
      config,
      calendar,
      dateOnlyUTC(2028, 1, 1),
      dateOnlyUTC(2028, 3, 1),
    );
    const februaryOccurrence = results.find((r) => r.rawDate.getUTCMonth() === 1);
    expect(februaryOccurrence && toISODate(februaryOccurrence.rawDate)).toBe("2028-02-29");
  });

  it("febrero 2025 (no bisiesto) usa el día 28 para dayOfMonth 29", () => {
    const config: RecurrenceConfig = {
      ruleId: "r4",
      startDate: dateOnlyUTC(2025, 1, 29),
      frequency: "MONTHLY",
      dayOfMonth: 29,
      baseAmount: 100,
    };
    const results = generateOccurrences(
      config,
      calendar,
      dateOnlyUTC(2025, 1, 1),
      dateOnlyUTC(2025, 3, 1),
    );
    const februaryOccurrence = results.find((r) => r.rawDate.getUTCMonth() === 1);
    expect(februaryOccurrence && toISODate(februaryOccurrence.rawDate)).toBe("2025-02-28");
  });
});

describe("motor de recurrencias — fines de semana y feriados", () => {
  it("desplaza una fecha en sábado al siguiente día hábil (lunes)", () => {
    // 2025-06-21 es sábado
    const config: RecurrenceConfig = {
      ruleId: "r5",
      startDate: dateOnlyUTC(2025, 6, 21),
      frequency: "DAILY",
      baseAmount: 10,
    };
    const results = generateOccurrences(
      config,
      calendar,
      dateOnlyUTC(2025, 6, 21),
      dateOnlyUTC(2025, 6, 21),
    );
    expect(toISODate(results[0]!.scheduledDate)).toBe("2025-06-23"); // lunes
  });

  it("desplaza un feriado chileno (18 de septiembre 2025, jueves) al siguiente día hábil", () => {
    const config: RecurrenceConfig = {
      ruleId: "r6",
      startDate: dateOnlyUTC(2025, 9, 18),
      frequency: "DAILY",
      baseAmount: 10,
    };
    const results = generateOccurrences(
      config,
      calendar,
      dateOnlyUTC(2025, 9, 18),
      dateOnlyUTC(2025, 9, 18),
    );
    // 18 y 19 son feriados (Fiestas Patrias), 20-21 fin de semana, 22 lunes hábil
    expect(toISODate(results[0]!.scheduledDate)).toBe("2025-09-22");
  });
});

describe("motor de recurrencias — quincenal", () => {
  it("genera ocurrencias cada 14 días desde la fecha de inicio", () => {
    const config: RecurrenceConfig = {
      ruleId: "r7",
      startDate: dateOnlyUTC(2025, 1, 6), // lunes
      frequency: "BIWEEKLY",
      weekDays: [1],
      baseAmount: 200,
    };
    const results = generateOccurrences(
      config,
      calendar,
      dateOnlyUTC(2025, 1, 1),
      dateOnlyUTC(2025, 3, 1),
    );
    const rawIso = results.map((r) => toISODate(r.rawDate));
    expect(rawIso).toEqual(["2025-01-06", "2025-01-20", "2025-02-03", "2025-02-17"]);
  });
});

describe("motor de recurrencias — modificación de ocurrencias", () => {
  const baseConfig: RecurrenceConfig = {
    ruleId: "r8",
    startDate: dateOnlyUTC(2025, 1, 6),
    frequency: "MONTHLY",
    dayOfMonth: 6,
    baseAmount: 1000,
  };

  it("modifica solo una ocurrencia (SINGLE) sin afectar las demás", () => {
    const results = generateOccurrences(
      baseConfig,
      calendar,
      dateOnlyUTC(2025, 1, 1),
      dateOnlyUTC(2025, 4, 1),
      [{ rawDate: dateOnlyUTC(2025, 2, 6), mode: "SINGLE", amount: 1500 }],
    );
    const amounts = results.map((r) => ({ date: toISODate(r.rawDate), amount: r.finalAmount }));
    expect(amounts).toEqual([
      { date: "2025-01-06", amount: 1000 },
      { date: "2025-02-06", amount: 1500 },
      { date: "2025-03-06", amount: 1000 },
    ]);
  });

  it("modifica esta ocurrencia y las siguientes (FORWARD) sin tocar las anteriores", () => {
    const results = generateOccurrences(
      baseConfig,
      calendar,
      dateOnlyUTC(2025, 1, 1),
      dateOnlyUTC(2025, 4, 1),
      [{ rawDate: dateOnlyUTC(2025, 2, 6), mode: "FORWARD", amount: 2000 }],
    );
    const amounts = results.map((r) => ({ date: toISODate(r.rawDate), amount: r.finalAmount }));
    expect(amounts).toEqual([
      { date: "2025-01-06", amount: 1000 },
      { date: "2025-02-06", amount: 2000 },
      { date: "2025-03-06", amount: 2000 },
    ]);
  });
});

describe("motor de recurrencias — desactivación y duplicados", () => {
  it("una recurrencia desactivada conserva sus ocurrencias ya generadas (no es responsabilidad del motor puro borrarlas)", () => {
    // El motor solo calcula fechas; la conservación de movimientos pagados al
    // desactivar es responsabilidad de la capa de persistencia (no se borra
    // nada aquí). Esta prueba documenta que generateOccurrences es idempotente
    // y no requiere que la regla esté "activa" para recalcular el pasado.
    const config: RecurrenceConfig = {
      ruleId: "r9",
      startDate: dateOnlyUTC(2025, 1, 1),
      frequency: "MONTHLY",
      dayOfMonth: 1,
      baseAmount: 300,
    };
    const firstRun = generateOccurrences(config, calendar, dateOnlyUTC(2025, 1, 1), dateOnlyUTC(2025, 3, 1));
    const secondRun = generateOccurrences(config, calendar, dateOnlyUTC(2025, 1, 1), dateOnlyUTC(2025, 3, 1));
    expect(firstRun.map((r) => r.idempotencyKey)).toEqual(secondRun.map((r) => r.idempotencyKey));
  });

  it("dedupeOccurrences previene duplicados por idempotencyKey", () => {
    const config: RecurrenceConfig = {
      ruleId: "r10",
      startDate: dateOnlyUTC(2025, 1, 1),
      frequency: "MONTHLY",
      dayOfMonth: 1,
      baseAmount: 300,
    };
    const run1 = generateOccurrences(config, calendar, dateOnlyUTC(2025, 1, 1), dateOnlyUTC(2025, 3, 1));
    const run2 = generateOccurrences(config, calendar, dateOnlyUTC(2025, 2, 1), dateOnlyUTC(2025, 4, 1));
    const merged = dedupeOccurrences([...run1, ...run2]);
    const keys = merged.map((r) => r.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
