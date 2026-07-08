import { APP_LOCALE, APP_TIME_ZONE, BASE_CURRENCY } from "./constants";

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(APP_LOCALE, {
    style: "currency",
    currency: BASE_CURRENCY,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Separador de miles "." (convencion chilena) sin simbolo de moneda ni
 * redondeo forzado a entero: para montos que pueden estar en cualquier
 * moneda (no solo CLP), donde el codigo de moneda ya se muestra aparte.
 */
export function formatAmountNumber(amount: string | number): string {
  return new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 2 }).format(Number(amount));
}

/**
 * Las fechas que recibe (projectedDate, paidAt, startDate, etc.) son dias de
 * calendario construidos siempre en UTC medianoche explicito (ver
 * parseOptionalDate en movements.ts). Forzar timeZone: "UTC" aqui es lo que
 * las lee de forma consistente sin importar donde se ejecute el codigo: en
 * el servidor (Vercel, UTC) o en el navegador de un usuario en Chile
 * (UTC-3/-4) via un Client Component (ej. QuickEditRow). Sin forzar la zona,
 * Intl usaba la zona del proceso que renderiza, que en el navegador retrocedia
 * un dia (ej. mostraba 07-07 en vez de 08-07), desordenando el listado de
 * Movimientos cuando se mezclaban filas server-rendered y client-rendered.
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: "UTC",
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
/** Para timestamps reales (createdAt, paidAt de pagos, etc.), no fechas de calendario: aqui si corresponde fijar la zona de la app. */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

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
