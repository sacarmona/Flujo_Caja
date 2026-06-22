import { Prisma } from "@prisma/client";
import type { Currency, MovementStatus, MovementType } from "@prisma/client";
import { dateKey, isBusinessDay, moveToNextBusinessDay } from "./recurrences";
import { decimal } from "./payments";

type IdName = {
  id: string;
  name: string;
};

type AccountRef = IdName & {
  code: string;
  parent?: IdName | null;
};

export type CashFlowPayment = {
  id: string;
  amount: Prisma.Decimal | number | string;
  paidAt: Date;
  currency: Currency;
  deletedAt?: Date | null;
  cancelledAt?: Date | null;
};

export type CashFlowMovement = {
  id: string;
  type: MovementType;
  status: MovementStatus;
  projectedDate: Date;
  realDate?: Date | null;
  projectedAmountClp: Prisma.Decimal | number | string;
  currency: Currency;
  accountingAccountId: string;
  businessUnitId: string;
  deletedAt?: Date | null;
  cancelledAt?: Date | null;
  accountingAccount: AccountRef;
  businessUnit: IdName;
  payments: CashFlowPayment[];
};

export type CashFlowOpeningBalance = {
  amount: Prisma.Decimal | number | string;
  balanceDate: Date;
  deletedAt?: Date | null;
};

export type CashFlowFilters = {
  businessUnitId?: string;
  accountingAccountId?: string;
  status?: MovementStatus;
  type?: MovementType;
  currency?: Currency;
};

export type CashFlowOptions = {
  startDate: Date;
  endDate?: Date;
  months?: number;
  holidays?: string[];
  filters?: CashFlowFilters;
};

export type CashFlowGroupTotals = {
  projectedIncome: Prisma.Decimal;
  projectedExpense: Prisma.Decimal;
  /**
   * Pendiente: Pendiente + Parcial + Pagado/Cobrado. Mutuamente excluyente
   * con projectedIncome/projectedExpense (Proyectado y Vencido) para evitar
   * doble conteo en el saldo combinado (usado por el dashboard, Modo
   * Comparacion y la sugerencia de saldo inicial).
   */
  pendingIncome: Prisma.Decimal;
  pendingExpense: Prisma.Decimal;
  /**
   * Real: solo Parcial + Pagado/Cobrado (subconjunto de pendingIncome/
   * pendingExpense, sin incluir Pendiente). Usado exclusivamente por Modo
   * Real del Calendario.
   */
  realIncome: Prisma.Decimal;
  realExpense: Prisma.Decimal;
  /**
   * Pronostico completo: todos los movimientos no cancelados (cualquier
   * estado), siempre con su fecha y monto proyectados.
   */
  fullProjectedIncome: Prisma.Decimal;
  fullProjectedExpense: Prisma.Decimal;
};

export type CashFlowDay = CashFlowGroupTotals & {
  date: Date;
  netFlow: Prisma.Decimal;
  accumulatedBalance: Prisma.Decimal;
  byCategory: Record<string, CashFlowGroupTotals>;
  byAccountingAccount: Record<string, CashFlowGroupTotals>;
  byBusinessUnit: Record<string, CashFlowGroupTotals>;
};

export type CashFlowWeek = CashFlowGroupTotals & {
  weekStart: Date;
  weekEnd: Date;
  netFlow: Prisma.Decimal;
};

export type CashFlowResult = {
  openingBalance: Prisma.Decimal;
  days: CashFlowDay[];
  weeks: CashFlowWeek[];
  /** Saldos confirmados/actualizados por el usuario, indexados por fecha exacta (ver confirmedBalanceByDate). */
  confirmedBalances: Map<string, Prisma.Decimal>;
};

const zeroTotals = (): CashFlowGroupTotals => ({
  projectedIncome: new Prisma.Decimal(0),
  projectedExpense: new Prisma.Decimal(0),
  pendingIncome: new Prisma.Decimal(0),
  pendingExpense: new Prisma.Decimal(0),
  realIncome: new Prisma.Decimal(0),
  realExpense: new Prisma.Decimal(0),
  fullProjectedIncome: new Prisma.Decimal(0),
  fullProjectedExpense: new Prisma.Decimal(0)
});

function addToTotals(target: CashFlowGroupTotals, bucket: keyof CashFlowGroupTotals, amount: Prisma.Decimal) {
  target[bucket] = target[bucket].plus(amount);
}

function getTotals(container: Record<string, CashFlowGroupTotals>, key: string) {
  container[key] ??= zeroTotals();
  return container[key];
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function mondayOf(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() + diff);
  return monday;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function normalizeRange(options: CashFlowOptions) {
  const startDate = new Date(options.startDate.getFullYear(), options.startDate.getMonth(), options.startDate.getDate());
  const requestedEnd = options.endDate ?? addMonths(startDate, options.months ?? 3);
  const maxEnd = addMonths(startDate, 12);
  const endDate = requestedEnd > maxEnd ? maxEnd : requestedEnd;
  return { startDate, endDate: new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) };
}

export function businessDaysBetween(startDate: Date, endDate: Date, holidays: string[] = []): Date[] {
  const holidaySet = new Set(holidays);
  const days: Date[] = [];
  let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

  while (cursor <= endDate) {
    if (isBusinessDay(cursor, holidaySet)) {
      days.push(new Date(cursor));
    }
    cursor = addDays(cursor, 1);
  }

  return days;
}

function matchesFilters(movement: CashFlowMovement, filters: CashFlowFilters = {}) {
  return (
    (!filters.businessUnitId || movement.businessUnitId === filters.businessUnitId) &&
    (!filters.accountingAccountId || movement.accountingAccountId === filters.accountingAccountId) &&
    (!filters.status || movement.status === filters.status) &&
    (!filters.type || movement.type === filters.type) &&
    (!filters.currency || movement.currency === filters.currency)
  );
}

function movementCategory(movement: CashFlowMovement) {
  return movement.accountingAccount.parent?.name ?? movement.accountingAccount.name;
}

/**
 * Estados que cuentan como "Pendiente" en el calendario: dinero ya
 * cobrado/pagado (parcial o total) o movimientos en espera de pago/cobro.
 * Proyectado y Vencido no entran; Cancelado ya se excluye antes.
 */
const pendingEligibleStatuses: MovementStatus[] = ["PENDING", "PARTIALLY_PAID", "PAID_OR_COLLECTED"];

/** Estados que cuentan como "Real": solo dinero efectivamente cobrado/pagado, parcial o total (sin Pendiente). */
const realEligibleStatuses: MovementStatus[] = ["PARTIALLY_PAID", "PAID_OR_COLLECTED"];

function addToAllLevels(day: CashFlowDay, movement: CashFlowMovement, bucket: keyof CashFlowGroupTotals, amount: Prisma.Decimal) {
  addToTotals(day, bucket, amount);
  addToTotals(getTotals(day.byCategory, movementCategory(movement)), bucket, amount);
  addToTotals(getTotals(day.byAccountingAccount, movement.accountingAccount.name), bucket, amount);
  addToTotals(getTotals(day.byBusinessUnit, movement.businessUnit.name), bucket, amount);
}

function addEntry(day: CashFlowDay, movement: CashFlowMovement, amount: Prisma.Decimal, status: MovementStatus) {
  const isIncome = movement.type === "INCOME";
  const isPending = pendingEligibleStatuses.includes(status);
  addToAllLevels(day, movement, isPending ? (isIncome ? "pendingIncome" : "pendingExpense") : isIncome ? "projectedIncome" : "projectedExpense", amount);

  if (realEligibleStatuses.includes(status)) {
    addToAllLevels(day, movement, isIncome ? "realIncome" : "realExpense", amount);
  }
}

function addFullProjectedEntry(day: CashFlowDay, movement: CashFlowMovement, amount: Prisma.Decimal) {
  addToAllLevels(day, movement, movement.type === "INCOME" ? "fullProjectedIncome" : "fullProjectedExpense", amount);
}

export function calculateOpeningBalance(openingBalances: CashFlowOpeningBalance[], startDate: Date): Prisma.Decimal {
  const latest = openingBalances
    .filter((balance) => !balance.deletedAt && balance.balanceDate <= startDate)
    .sort((a, b) => b.balanceDate.getTime() - a.balanceDate.getTime())[0];

  return latest ? decimal(latest.amount) : new Prisma.Decimal(0);
}

export function calculateCashFlowByBusinessDay(
  movements: CashFlowMovement[],
  openingBalances: CashFlowOpeningBalance[],
  options: CashFlowOptions
): CashFlowResult {
  const { startDate, endDate } = normalizeRange(options);
  const holidaySet = new Set(options.holidays ?? []);
  const openingBalance = calculateOpeningBalance(openingBalances, startDate);
  const days = businessDaysBetween(startDate, endDate, options.holidays).map<CashFlowDay>((date) => ({
    date,
    ...zeroTotals(),
    netFlow: new Prisma.Decimal(0),
    accumulatedBalance: new Prisma.Decimal(0),
    byCategory: {},
    byAccountingAccount: {},
    byBusinessUnit: {}
  }));
  const dayByKey = new Map(days.map((day) => [dateKey(day.date), day]));

  for (const movement of movements.filter((item) => !item.deletedAt && !item.cancelledAt && item.status !== "CANCELLED")) {
    if (!matchesFilters(movement, options.filters)) {
      continue;
    }

    const projectedDate = moveToNextBusinessDay(movement.projectedDate, holidaySet);
    const projectedDay = dayByKey.get(dateKey(projectedDate));
    if (projectedDay) {
      addFullProjectedEntry(projectedDay, movement, decimal(movement.projectedAmountClp));
    }

    const active = movement.payments.filter((payment) => !payment.deletedAt && !payment.cancelledAt);

    if (active.length > 0) {
      for (const payment of active) {
        const paymentDate = moveToNextBusinessDay(payment.paidAt, holidaySet);
        const day = dayByKey.get(dateKey(paymentDate));
        if (day) {
          addEntry(day, movement, decimal(payment.amount), movement.status);
        }
      }
    } else if (projectedDay) {
      addEntry(projectedDay, movement, decimal(movement.projectedAmountClp), movement.status);
    }
  }

  /**
   * Saldos confirmados/actualizados por el usuario (ej. "Confirmar calculado"
   * o "Actualizar" en una semana del Calendario), indexados por fecha exacta.
   * Si una semana no tiene confirmacion, se sigue usando por defecto el saldo
   * calculado (acumulado de la semana anterior); si la tiene, esa pasa a ser
   * el saldo inicial de esa semana en adelante.
   */
  const confirmedBalanceByDate = new Map(
    openingBalances.filter((balance) => !balance.deletedAt).map((balance) => [dateKey(balance.balanceDate), decimal(balance.amount)] as const)
  );

  let accumulated = openingBalance;
  for (const day of days) {
    const confirmed = confirmedBalanceByDate.get(dateKey(day.date));
    if (confirmed) {
      accumulated = confirmed;
    }
    day.netFlow = day.projectedIncome.plus(day.pendingIncome).minus(day.projectedExpense).minus(day.pendingExpense);
    accumulated = accumulated.plus(day.netFlow);
    day.accumulatedBalance = accumulated;
  }

  const weekMap = new Map<string, CashFlowWeek>();
  for (const day of days) {
    const weekStart = mondayOf(day.date);
    const key = dateKey(weekStart);
    const week = weekMap.get(key) ?? {
      weekStart,
      weekEnd: addDays(weekStart, 6),
      ...zeroTotals(),
      netFlow: new Prisma.Decimal(0)
    };
    week.projectedIncome = week.projectedIncome.plus(day.projectedIncome);
    week.projectedExpense = week.projectedExpense.plus(day.projectedExpense);
    week.pendingIncome = week.pendingIncome.plus(day.pendingIncome);
    week.pendingExpense = week.pendingExpense.plus(day.pendingExpense);
    week.realIncome = week.realIncome.plus(day.realIncome);
    week.realExpense = week.realExpense.plus(day.realExpense);
    week.fullProjectedIncome = week.fullProjectedIncome.plus(day.fullProjectedIncome);
    week.fullProjectedExpense = week.fullProjectedExpense.plus(day.fullProjectedExpense);
    week.netFlow = week.netFlow.plus(day.netFlow);
    weekMap.set(key, week);
  }

  return { openingBalance, days, weeks: [...weekMap.values()], confirmedBalances: confirmedBalanceByDate };
}
