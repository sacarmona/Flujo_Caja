import { APP_LOCALE, APP_TIME_ZONE, BASE_CURRENCY } from "./constants";

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(APP_LOCALE, {
    style: "currency",
    currency: BASE_CURRENCY,
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(APP_LOCALE, {
    dateStyle: "medium",
    timeZone: APP_TIME_ZONE
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
