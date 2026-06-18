import type { RecurrenceFrequency } from "@prisma/client";

export type RecurrenceDefinition = {
  frequency: RecurrenceFrequency;
  intervalDays?: number | null;
  startDate: Date;
  endDate?: Date | null;
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
      return addDays(current, 15);
    case "MONTHLY":
      return addMonthsClamped(current, 1, preferredDay);
    case "QUARTERLY":
      return addMonthsClamped(current, 3, preferredDay);
    case "SEMIANNUAL":
      return addMonthsClamped(current, 6, preferredDay);
    case "ANNUAL":
      return addMonthsClamped(current, 12, preferredDay);
  }
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
  const preferredDay = start.getDate();
  const seenProjected = new Set<string>();
  const occurrences: RecurrenceOccurrence[] = [];

  if (definition.frequency === "EVERY_N_DAYS" && (!definition.intervalDays || definition.intervalDays <= 0)) {
    throw new Error("Cada N dias requiere un intervalo positivo.");
  }

  let nominal = start;

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

export const recurrenceEditScopes = ["THIS_OCCURRENCE", "THIS_AND_FOLLOWING"] as const;

export function isFutureScopePrepared(scope: (typeof recurrenceEditScopes)[number]): boolean {
  return scope === "THIS_AND_FOLLOWING";
}
