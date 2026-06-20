import { APP_LOCALE, APP_TIME_ZONE, BASE_CURRENCY } from "./constants";

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(APP_LOCALE, {
    style: "currency",
    currency: BASE_CURRENCY,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Las fechas que recibe (projectedDate, paidAt, startDate, etc.) son dias de
 * calendario construidos con new Date(year, month, day) en la zona horaria
 * del proceso, sin hora real asociada. Forzar timeZone: APP_TIME_ZONE aqui
 * reinterpretaria ese instante en Chile, lo que en un servidor que corre en
 * UTC (Vercel) podia retroceder un dia (ej. mostrar 25/6 en vez de 26/6). Sin
 * timeZone, Intl usa la zona del proceso, la misma con la que se construyo
 * la fecha, igual que dateLabel() en el Calendario.
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(APP_LOCALE, {
    dateStyle: "medium"
  }).format(date);
}

/**
 * "Hoy" segun la zona horaria de la app (America/Santiago, UTC-4/-3), no la
 * del servidor. En Vercel el proceso corre en UTC: usar new Date() directo
 * para calcular "hoy" puede adelantar el dia mientras en Chile aun es el
 * dia anterior. Devuelve la fecha local a medianoche (mismo patron que el
 * resto del codigo: new Date(year, month - 1, day)).
 */
export function todayInAppTimeZone(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return new Date(year, month - 1, day);
}
