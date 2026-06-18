/**
 * Copia local de feriados chilenos por año. Se mantiene fija una vez publicada
 * para que los cálculos históricos no cambien si la fuente externa cambia.
 * Feriados que dependen del calendario lunar (Viernes Santo, Sábado Santo) se
 * cargan explícitamente por año; no se calculan dinámicamente.
 */
export interface StaticHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

export const CHILE_HOLIDAYS: Record<number, StaticHoliday[]> = {
  2025: [
    { date: "2025-01-01", name: "Año Nuevo" },
    { date: "2025-04-18", name: "Viernes Santo" },
    { date: "2025-04-19", name: "Sábado Santo" },
    { date: "2025-05-01", name: "Día del Trabajo" },
    { date: "2025-05-21", name: "Día de las Glorias Navales" },
    { date: "2025-06-29", name: "San Pedro y San Pablo" },
    { date: "2025-07-16", name: "Día de la Virgen del Carmen" },
    { date: "2025-08-15", name: "Asunción de la Virgen" },
    { date: "2025-09-18", name: "Fiestas Patrias" },
    { date: "2025-09-19", name: "Glorias del Ejército" },
    { date: "2025-10-12", name: "Encuentro de Dos Mundos" },
    { date: "2025-10-31", name: "Día de las Iglesias Evangélicas" },
    { date: "2025-11-01", name: "Día de Todos los Santos" },
    { date: "2025-12-08", name: "Inmaculada Concepción" },
    { date: "2025-12-25", name: "Navidad" },
  ],
  2026: [
    { date: "2026-01-01", name: "Año Nuevo" },
    { date: "2026-04-03", name: "Viernes Santo" },
    { date: "2026-04-04", name: "Sábado Santo" },
    { date: "2026-05-01", name: "Día del Trabajo" },
    { date: "2026-05-21", name: "Día de las Glorias Navales" },
    { date: "2026-06-29", name: "San Pedro y San Pablo" },
    { date: "2026-07-16", name: "Día de la Virgen del Carmen" },
    { date: "2026-08-15", name: "Asunción de la Virgen" },
    { date: "2026-09-18", name: "Fiestas Patrias" },
    { date: "2026-09-19", name: "Glorias del Ejército" },
    { date: "2026-10-12", name: "Encuentro de Dos Mundos" },
    { date: "2026-10-31", name: "Día de las Iglesias Evangélicas" },
    { date: "2026-11-01", name: "Día de Todos los Santos" },
    { date: "2026-12-08", name: "Inmaculada Concepción" },
    { date: "2026-12-25", name: "Navidad" },
  ],
};
