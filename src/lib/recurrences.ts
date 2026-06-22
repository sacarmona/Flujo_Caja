import type { RecurrenceFrequency } from "@prisma/client";

export type RecurrenceDefinition = {
  frequency: RecurrenceFrequency;
  intervalDays?: number | null;
  dayOfMonth?: number | null;
  dayOfWeek?: number | null;
  startDate: Date;
  endDate?: Date | null;
};

const monthlyFamily = ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"] as const satisfies RecurrenceFrequency[];
const monthlyStepByFrequency: Record<(typeof monthlyFamily)[number], number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12
};

export type RecurrenceOccurrence = {
  occurrenceDate: Date;
  projectedDate: Date;
};

export type RecurrenceGenerationOptions = {
  months?: number;
  holidays?: string[];
  existingOccurrenceKeys?: string[];
};

function dateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = dateOnly(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonthsClamped(date: Date, months: number, preferredDay = date.getDate()): Date {
  const year = date.getFullYear();
  const month = date.getMonth() + months;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(preferredDay, lastDay));
}

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isBusinessDay(date: Date, holidays: Set<string>): boolean {
  return !isWeekend(date) && !holidays.has(dateKey(date));
}

export function moveToNextBusinessDay(date: Date, holidays: Set<string>): Date {
  let cursor = dateOnly(date);

  while (!isBusinessDay(cursor, holidays)) {
    cursor = addDays(cursor, 1);
  }

  return cursor;
}

function horizonEnd(startDate: Date, endDate: Date | null | undefined, months: number): Date {
  const generatedEnd = addMonthsClamped(startDate, months, startDate.getDate());
  return endDate && endDate < generatedEnd ? dateOnly(endDate) : generatedEnd;
}

function nextNominalDate(current: Date, definition: RecurrenceDefinition, preferredDay: number): Date {
  switch (definition.frequency) {
    case "DAILY":
    case "BUSINESS_DAYS":
      return addDays(current, 1);
    case "EVERY_N_DAYS":
      return addDays(current, definition.intervalDays ?? 1);
    case "WEEKLY":
      return addDays(current, 7);
    case "BIWEEKLY":
      // Cada 2 semanas exactas (no +15 dias) para mantener el mismo dia de la semana en cada ocurrencia.
      return addDays(current, 14);
    case "MONTHLY":
    case "QUARTERLY":
    case "SEMIANNUAL":
    case "ANNUAL":
      return addMonthsClamped(current, monthlyStepByFrequency[definition.frequency], preferredDay);
  }
}

/** Primer dia >= start que cae en preferredDay del mes (con clamp a fin de mes), avanzando de a stepMonths si ya paso en el mes de start. */
function firstOccurrenceForMonthlyFamily(start: Date, preferredDay: number, stepMonths: number): Date {
  const lastDayOfStartMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const candidate = new Date(start.getFullYear(), start.getMonth(), Math.min(preferredDay, lastDayOfStartMonth));
  return candidate < start ? addMonthsClamped(candidate, stepMonths, preferredDay) : candidate;
}

/** Primer dia >= start cuyo dia de la semana coincide con preferredWeekday (0=domingo). */
function firstOccurrenceForWeekday(start: Date, preferredWeekday: number): Date {
  const diff = (preferredWeekday - start.getDay() + 7) % 7;
  return addDays(start, diff);
}

function isMonthlyFamily(frequency: RecurrenceFrequency): frequency is (typeof monthlyFamily)[number] {
  return (monthlyFamily as readonly RecurrenceFrequency[]).includes(frequency);
}

export function generateRecurrenceOccurrences(
  definition: RecurrenceDefinition,
  options: RecurrenceGenerationOptions = {}
): RecurrenceOccurrence[] {
  const holidays = new Set(options.holidays ?? []);
  const existing = new Set(options.existingOccurrenceKeys ?? []);
  const months = options.months ?? 12;
  const start = dateOnly(definition.startDate);
  const end = horizonEnd(start, definition.endDate, months);
  const seenProjected = new Set<string>();
  const occurrences: RecurrenceOccurrence[] = [];

  if (definition.frequency === "EVERY_N_DAYS" && (!definition.intervalDays || definition.intervalDays <= 0)) {
    throw new Error("Cada N dias requiere un intervalo positivo.");
  }

  let preferredDay = start.getDate();
  let nominal = start;

  if (isMonthlyFamily(definition.frequency)) {
    preferredDay = definition.dayOfMonth ?? start.getDate();
    nominal = firstOccurrenceForMonthlyFamily(start, preferredDay, monthlyStepByFrequency[definition.frequency]);
  } else if (definition.frequency === "WEEKLY" || definition.frequency === "BIWEEKLY") {
    const preferredWeekday = definition.dayOfWeek ?? start.getDay();
    nominal = firstOccurrenceForWeekday(start, preferredWeekday);
  }

  while (nominal <= end) {
    const occurrenceKey = dateKey(nominal);
    const projected = moveToNextBusinessDay(nominal, holidays);
    const projectedKey = dateKey(projected);
    const includeBusinessDay = definition.frequency !== "BUSINESS_DAYS" || dateKey(nominal) === projectedKey;

    if (includeBusinessDay && !existing.has(occurrenceKey) && !seenProjected.has(projectedKey)) {
      occurrences.push({
        occurrenceDate: nominal,
        projectedDate: projected
      });
      seenProjected.add(projectedKey);
    }

    nominal = nextNominalDate(nominal, definition, preferredDay);
  }

  return occurrences;
}

export function deactivateRecurrence<T extends { isActive: boolean; deactivatedAt: Date | null }>(
  recurrence: T,
  at = new Date()
): T {
  return { ...recurrence, isActive: false, deactivatedAt: at };
}

