import { CHILE_HOLIDAYS, type StaticHoliday } from "./holidays-cl";
import { isWeekend, parseISODate, toISODate } from "./date-utils";

export interface ManualNonBusinessDay {
  date: string; // YYYY-MM-DD
  name: string;
}

/**
 * Abstracción del calendario de negocio chileno: sábados/domingos, feriados
 * oficiales y días no laborables especiales agregados manualmente por ADMIN.
 *
 * Se mantiene una copia local de feriados (holidays-cl.ts) en lugar de
 * consultar una fuente externa en cada cálculo, para que los cálculos
 * históricos no cambien inesperadamente si la fuente cambia en el futuro.
 */
export class BusinessCalendar {
  private readonly holidaySet: Set<string>;

  constructor(extraNonBusinessDays: ManualNonBusinessDay[] = []) {
    const allHolidays: StaticHoliday[] = Object.values(CHILE_HOLIDAYS).flat();
    this.holidaySet = new Set([
      ...allHolidays.map((h) => h.date),
      ...extraNonBusinessDays.map((h) => h.date),
    ]);
  }

  isHoliday(date: Date): boolean {
    return this.holidaySet.has(toISODate(date));
  }

  isBusinessDay(date: Date): boolean {
    return !isWeekend(date) && !this.isHoliday(date);
  }

  /** Si la fecha no es hábil, retorna el siguiente día hábil; si lo es, la retorna sin cambios. */
  nextBusinessDay(date: Date): Date {
    let current = date;
    while (!this.isBusinessDay(current)) {
      current = new Date(current.getTime());
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return current;
  }

  /** N-ésimo día hábil siguiente a partir de (sin incluir) la fecha dada. */
  addBusinessDays(date: Date, count: number): Date {
    let current = date;
    let remaining = count;
    while (remaining > 0) {
      current = new Date(current.getTime());
      current.setUTCDate(current.getUTCDate() + 1);
      if (this.isBusinessDay(current)) {
        remaining -= 1;
      }
    }
    return current;
  }
}

export function isoToDate(iso: string): Date {
  return parseISODate(iso);
}
