import { Prisma } from "@prisma/client";
import type { Role } from "@prisma/client";
import type { CashFlowDay, CashFlowResult } from "./cash-flow";
import { dateKey } from "./recurrences";

export function canManageOpeningBalances(role: Role): boolean {
  return role === "ADMIN" || role === "FINANCE";
}

export function assertCanManageOpeningBalances(role: Role): void {
  if (!canManageOpeningBalances(role)) {
    throw new Error("Solo ADMIN y FINANCE pueden actualizar el saldo inicial.");
  }
}

export function parseOpeningBalanceAmount(value: string): Prisma.Decimal {
  if (!value.trim()) {
    throw new Error("El saldo inicial es obligatorio.");
  }

  const normalized = value
    .trim()
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const amount = new Prisma.Decimal(normalized);

  if (!amount.isFinite()) {
    throw new Error("El saldo inicial debe ser un numero valido.");
  }

  return amount;
}

export function parseOpeningBalanceDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000`);

  if (!value || Number.isNaN(date.getTime())) {
    throw new Error("La fecha del saldo inicial es obligatoria.");
  }

  return date;
}

export function dateInputValue(date: Date): string {
  return dateKey(date);
}

export function weekOpeningBalance(result: CashFlowResult, weekDays: CashFlowDay[]): Prisma.Decimal {
  const firstDay = weekDays[0];
  if (!firstDay) return result.openingBalance;

  const firstDayIndex = result.days.findIndex((day) => dateKey(day.date) === dateKey(firstDay.date));
  if (firstDayIndex <= 0) return result.openingBalance;

  return result.days[firstDayIndex - 1].accumulatedBalance;
}

/**
 * Sugiere la siguiente semana (lunes a domingo) que todavia no tiene un
 * saldo confirmado/actualizado, para que "Confirmar calculado" siempre
 * avance a la semana que falta en vez de quedar pegado en la primera semana
 * visible una vez que esa ya se confirmo (lo que mostraria el saldo
 * calculado viejo y, si se confirma de nuevo, sobreescribiria el saldo
 * confirmado correcto con ese valor desactualizado).
 */
export function suggestedOpeningBalanceWeek(result: CashFlowResult, weeks: Array<{ days: CashFlowDay[] }>) {
  const fullWeeks = weeks.filter((week) => week.days[0]?.date.getDay() === 1);
  const isConfirmed = (week: { days: CashFlowDay[] }) => {
    const firstDay = week.days[0];
    return firstDay ? result.confirmedBalances.has(dateKey(firstDay.date)) : false;
  };

  const nextUnconfirmedFullWeek = fullWeeks.find((week) => !isConfirmed(week));
  const week = nextUnconfirmedFullWeek ?? fullWeeks.at(-1) ?? weeks[0];

  if (!week?.days[0]) {
    return null;
  }

  return {
    date: week.days[0].date,
    amount: weekOpeningBalance(result, week.days)
  };
}
