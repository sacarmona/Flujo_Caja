/**
 * Numero de semana ISO 8601: semanas de lunes a domingo, y la Semana 1 de
 * cada año es la que contiene el primer jueves de ese año. Se usa UTC solo
 * para la aritmetica de dias (evita desfases por horario de verano), tomando
 * los componentes de fecha local (no es una conversion real de zona horaria).
 */
export function weekOfYear(date: Date): { year: number; week: number } {
  const isoWeekday = ((date.getDay() + 6) % 7) + 1; // lunes=1 ... domingo=7
  const thursdayUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + (4 - isoWeekday));
  const isoYear = new Date(thursdayUtc).getUTCFullYear();
  const yearStartUtc = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil((Math.round((thursdayUtc - yearStartUtc) / 86400000) + 1) / 7);
  return { year: isoYear, week };
}

/** Clave "año-semana" ISO 8601 de una fecha; usada para agrupar y para indexar valores por semana. */
export function weekKeyOf(date: Date): string {
  const { year, week } = weekOfYear(date);
  return `${year}-${week}`;
}
