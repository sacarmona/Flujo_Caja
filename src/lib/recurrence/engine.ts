import { BusinessCalendar } from "../calendar/business-calendar";
import { addDays, addMonths, compareDates, getISOWeekday, toISODate } from "../calendar/date-utils";
import type {
  OccurrenceOverride,
  RecurrenceConfig,
  RecurrenceOccurrenceResult,
} from "./types";

/**
 * Motor de recurrencias — funciones puras, sin acceso a base de datos.
 *
 * Reglas aplicadas (ver AGENTS.md / spec del proyecto):
 * 1. Se generan primero fechas "teóricas" (raw) según la frecuencia.
 * 2. Si el día 29/30/31 no existe en el mes, se usa el último día del mes
 *    (ver addMonths en date-utils, que clampa el día).
 * 3. Luego se aplica el ajuste por día no hábil (siguiente día hábil).
 * 4. La idempotencyKey se calcula sobre la fecha teórica (raw), no sobre la
 *    fecha ajustada, para que el cálculo sea estable y no genere duplicados
 *    aunque cambie el calendario de feriados en el futuro.
 */

function rawDatesForFrequency(config: RecurrenceConfig, rangeStart: Date, rangeEnd: Date): Date[] {
  const interval = config.interval ?? 1;
  const dates: Date[] = [];

  switch (config.frequency) {
    case "DAILY":
    case "EVERY_N_DAYS": {
      const step = config.frequency === "DAILY" ? 1 : interval;
      let current = config.startDate;
      while (compareDates(current, rangeEnd) <= 0) {
        if (compareDates(current, rangeStart) >= 0) dates.push(current);
        current = addDays(current, step);
      }
      break;
    }
    case "BUSINESS_DAYS": {
      // Generadas como fechas teóricas diarias; el filtro de día hábil se
      // aplica igual que el resto mediante el ajuste de calendario.
      let current = config.startDate;
      while (compareDates(current, rangeEnd) <= 0) {
        if (compareDates(current, rangeStart) >= 0) dates.push(current);
        current = addDays(current, 1);
      }
      break;
    }
    case "WEEKLY":
    case "BIWEEKLY": {
      const weekStep = (config.frequency === "BIWEEKLY" ? 2 : interval) * 7;
      const weekDays = config.weekDays && config.weekDays.length > 0
        ? config.weekDays
        : [getISOWeekday(config.startDate)];
      let weekAnchor = config.startDate;
      while (compareDates(weekAnchor, rangeEnd) <= 0) {
        for (const isoDay of weekDays) {
          const offset = isoDay - getISOWeekday(weekAnchor);
          const candidate = addDays(weekAnchor, offset);
          if (
            compareDates(candidate, config.startDate) >= 0 &&
            compareDates(candidate, rangeStart) >= 0 &&
            compareDates(candidate, rangeEnd) <= 0
          ) {
            dates.push(candidate);
          }
        }
        weekAnchor = addDays(weekAnchor, weekStep);
      }
      break;
    }
    case "MONTHLY":
    case "QUARTERLY":
    case "SEMIANNUAL":
    case "ANNUAL": {
      const monthStep =
        config.frequency === "MONTHLY"
          ? interval
          : config.frequency === "QUARTERLY"
            ? 3 * interval
            : config.frequency === "SEMIANNUAL"
              ? 6 * interval
              : 12 * interval;
      let occurrenceIndex = 0;
      let current = config.dayOfMonth
        ? addMonths(config.startDate, 0, config.dayOfMonth)
        : config.startDate;
      while (compareDates(current, rangeEnd) <= 0) {
        if (compareDates(current, rangeStart) >= 0 && compareDates(current, config.startDate) >= 0) {
          dates.push(current);
        }
        occurrenceIndex += 1;
        current = addMonths(config.startDate, occurrenceIndex * monthStep, config.dayOfMonth);
      }
      break;
    }
  }

  return dates.filter((d) => !config.endDate || compareDates(d, config.endDate) <= 0);
}

export function buildIdempotencyKey(ruleId: string, rawDate: Date): string {
  return `${ruleId}:${toISODate(rawDate)}`;
}

function resolveOverride(
  rawDate: Date,
  overrides: OccurrenceOverride[],
): OccurrenceOverride | undefined {
  const exact = overrides.find(
    (o) => o.mode === "SINGLE" && compareDates(o.rawDate, rawDate) === 0,
  );
  if (exact) return exact;

  const forward = overrides
    .filter((o) => o.mode === "FORWARD" && compareDates(o.rawDate, rawDate) <= 0)
    .sort((a, b) => compareDates(b.rawDate, a.rawDate))[0];
  return forward;
}

export function generateOccurrences(
  config: RecurrenceConfig,
  calendar: BusinessCalendar,
  rangeStart: Date,
  rangeEnd: Date,
  overrides: OccurrenceOverride[] = [],
): RecurrenceOccurrenceResult[] {
  const rawDates = rawDatesForFrequency(config, rangeStart, rangeEnd);

  return rawDates.map((rawDate) => {
    const scheduledDate = calendar.nextBusinessDay(rawDate);
    const override = resolveOverride(rawDate, overrides);
    const computedAmount = config.baseAmount;
    const manualAdjustment = override?.amount !== undefined ? override.amount - computedAmount : 0;
    const finalAmount = override?.amount ?? computedAmount;

    return {
      idempotencyKey: buildIdempotencyKey(config.ruleId, rawDate),
      rawDate,
      scheduledDate,
      baseAmount: config.baseAmount,
      computedAmount,
      manualAdjustment,
      finalAmount,
    };
  });
}

/** Elimina duplicados por idempotencyKey, conservando la primera ocurrencia. */
export function dedupeOccurrences(
  occurrences: RecurrenceOccurrenceResult[],
): RecurrenceOccurrenceResult[] {
  const seen = new Set<string>();
  const result: RecurrenceOccurrenceResult[] = [];
  for (const occ of occurrences) {
    if (seen.has(occ.idempotencyKey)) continue;
    seen.add(occ.idempotencyKey);
    result.push(occ);
  }
  return result;
}
