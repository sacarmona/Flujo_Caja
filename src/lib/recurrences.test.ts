import { describe, expect, it } from "vitest";
import {
  dateKey,
  deactivateRecurrence,
  generateRecurrenceOccurrences,
  isFutureScopePrepared
} from "./recurrences";

function keys(dates: ReturnType<typeof generateRecurrenceOccurrences>) {
  return dates.map((item) => dateKey(item.projectedDate));
}

describe("recurrence engine", () => {
  it("handles monthly days 28 to 31 with month-end clamping", () => {
    expect(keys(generateRecurrenceOccurrences({ frequency: "MONTHLY", startDate: new Date(2025, 0, 28) }, { months: 2 }))).toContain(
      "2025-02-28"
    );
    expect(keys(generateRecurrenceOccurrences({ frequency: "MONTHLY", startDate: new Date(2025, 0, 29) }, { months: 2 }))).toContain(
      "2025-02-28"
    );
    expect(keys(generateRecurrenceOccurrences({ frequency: "MONTHLY", startDate: new Date(2025, 0, 30) }, { months: 2 }))).toContain(
      "2025-02-28"
    );
    expect(keys(generateRecurrenceOccurrences({ frequency: "MONTHLY", startDate: new Date(2025, 0, 31) }, { months: 2 }))).toContain(
      "2025-02-28"
    );
  });

  it("uses February 29 in leap years", () => {
    const occurrences = generateRecurrenceOccurrences({ frequency: "MONTHLY", startDate: new Date(2024, 0, 31) }, { months: 2 });

    expect(keys(occurrences)).toContain("2024-02-29");
  });

  it("moves weekends to the next business day", () => {
    const occurrences = generateRecurrenceOccurrences({ frequency: "WEEKLY", startDate: new Date(2026, 5, 20) }, { months: 1 });

    expect(dateKey(occurrences[0].occurrenceDate)).toBe("2026-06-20");
    expect(dateKey(occurrences[0].projectedDate)).toBe("2026-06-22");
  });

  it("excludes holidays by moving to the next business day", () => {
    const occurrences = generateRecurrenceOccurrences(
      { frequency: "DAILY", startDate: new Date(2026, 8, 17), endDate: new Date(2026, 8, 20) },
      { holidays: ["2026-09-18"] }
    );

    expect(keys(occurrences)).toEqual(["2026-09-17", "2026-09-21"]);
  });

  it("generates business days only", () => {
    const occurrences = generateRecurrenceOccurrences(
      { frequency: "BUSINESS_DAYS", startDate: new Date(2026, 5, 19), endDate: new Date(2026, 5, 23) },
      {}
    );

    expect(keys(occurrences)).toEqual(["2026-06-19", "2026-06-22", "2026-06-23"]);
  });

  it("generates every N days and biweekly occurrences", () => {
    expect(
      keys(generateRecurrenceOccurrences({ frequency: "EVERY_N_DAYS", intervalDays: 10, startDate: new Date(2026, 0, 1) }, { months: 1 }))
    ).toEqual(["2026-01-01", "2026-01-12", "2026-01-21", "2026-02-02"]);
    // Quincenal avanza cada 14 dias (2 semanas exactas) para mantener el mismo dia de la semana en cada ocurrencia.
    expect(keys(generateRecurrenceOccurrences({ frequency: "BIWEEKLY", startDate: new Date(2026, 0, 1) }, { months: 1 }))).toEqual([
      "2026-01-01",
      "2026-01-15",
      "2026-01-29"
    ]);
  });

  it("ancla el dia de mes/semana al campo, no a la Fecha de inicio, una vez que la regla lo especifica", () => {
    // Inicio 10-jun (martes), Dia del mes = 22: la primera ocurrencia no es el 10, sino el 22-jun.
    expect(
      keys(
        generateRecurrenceOccurrences({ frequency: "MONTHLY", startDate: new Date(2026, 5, 10), dayOfMonth: 22 }, { months: 2 })
      )
    ).toEqual(["2026-06-22", "2026-07-22"]);

    // Inicio 25-jun, Dia del mes = 5: como el 5 de junio ya paso, la primera ocurrencia salta a julio.
    // El 05-07-2026 es domingo, por eso la fecha proyectada se mueve al lunes 06-07-2026.
    expect(
      keys(generateRecurrenceOccurrences({ frequency: "MONTHLY", startDate: new Date(2026, 5, 25), dayOfMonth: 5 }, { months: 2 }))
    ).toEqual(["2026-07-06", "2026-08-05"]);

    // Inicio lunes 2026-06-15, Dia de la semana = 5 (viernes): primera ocurrencia el viernes siguiente, luego cada 7 dias.
    expect(
      keys(generateRecurrenceOccurrences({ frequency: "WEEKLY", startDate: new Date(2026, 5, 15), dayOfWeek: 5 }, { months: 1 }))
    ).toEqual(["2026-06-19", "2026-06-26", "2026-07-03", "2026-07-10"]);

    // Sin Dia del mes/semana definido, se mantiene el comportamiento anterior (usa el dia de Fecha de inicio).
    expect(
      keys(generateRecurrenceOccurrences({ frequency: "MONTHLY", startDate: new Date(2026, 5, 10) }, { months: 1 }))
    ).toEqual(["2026-06-10", "2026-07-10"]);
  });

  it("generates quarterly, semiannual and annual occurrences", () => {
    expect(keys(generateRecurrenceOccurrences({ frequency: "QUARTERLY", startDate: new Date(2026, 0, 15) }, { months: 12 }))).toEqual([
      "2026-01-15",
      "2026-04-15",
      "2026-07-15",
      "2026-10-15",
      "2027-01-15"
    ]);
    expect(keys(generateRecurrenceOccurrences({ frequency: "SEMIANNUAL", startDate: new Date(2026, 0, 15) }, { months: 12 }))).toEqual([
      "2026-01-15",
      "2026-07-15",
      "2027-01-15"
    ]);
    expect(keys(generateRecurrenceOccurrences({ frequency: "ANNUAL", startDate: new Date(2026, 0, 15) }, { months: 12 }))).toEqual([
      "2026-01-15",
      "2027-01-15"
    ]);
  });

  it("avoids duplicates for existing occurrence dates and adjusted projected dates", () => {
    const occurrences = generateRecurrenceOccurrences(
      { frequency: "DAILY", startDate: new Date(2026, 5, 19), endDate: new Date(2026, 5, 22) },
      { existingOccurrenceKeys: ["2026-06-19"] }
    );

    expect(keys(occurrences)).toEqual(["2026-06-22"]);
  });

  it("deactivates recurrence without deleting history and prepares future edit scope", () => {
    const recurrence: { isActive: boolean; deactivatedAt: Date | null } = { isActive: true, deactivatedAt: null };
    const deactivated = deactivateRecurrence(recurrence, new Date("2026-06-18T00:00:00.000Z"));

    expect(deactivated.isActive).toBe(false);
    expect(deactivated.deactivatedAt?.getFullYear()).toBe(2026);
    expect(isFutureScopePrepared("THIS_AND_FOLLOWING")).toBe(true);
  });
});
