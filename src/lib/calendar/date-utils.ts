/**
 * Utilidades de fecha de calendario (sin hora ni zona horaria).
 * Todas las fechas se representan internamente como UTC a medianoche para
 * evitar desplazamientos accidentales por zona horaria del servidor.
 */

export function dateOnlyUTC(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return dateOnlyUTC(y as number, m as number, d as number);
}

export function toISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function lastDayOfMonth(year: number, month: number): number {
  // month es 1-12; día 0 del mes siguiente = último día del mes actual.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addMonths(date: Date, months: number, dayOfMonth?: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const totalMonths = month - 1 + months;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const targetDay = dayOfMonth ?? date.getUTCDate();
  const clampedDay = Math.min(targetDay, lastDayOfMonth(targetYear, targetMonth));
  return dateOnlyUTC(targetYear, targetMonth, clampedDay);
}

export function getWeekday(date: Date): number {
  // 0 = domingo ... 6 = sábado (estándar JS, usado solo internamente)
  return date.getUTCDay();
}

/** Lunes = 1 ... domingo = 7 (ISO) */
export function getISOWeekday(date: Date): number {
  const day = getWeekday(date);
  return day === 0 ? 7 : day;
}

export function isWeekend(date: Date): boolean {
  const day = getWeekday(date);
  return day === 0 || day === 6;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function compareDates(a: Date, b: Date): number {
  return a.getTime() - b.getTime();
}

/** Lunes de la semana ISO que contiene la fecha dada. */
export function startOfISOWeek(date: Date): Date {
  const isoWeekday = getISOWeekday(date);
  return addDays(date, -(isoWeekday - 1));
}
