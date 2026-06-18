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
