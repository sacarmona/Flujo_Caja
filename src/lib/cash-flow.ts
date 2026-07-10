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
  status?: MovementStatus | MovementStatus[];
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

function matchesStatus(movementStatus: MovementStatus, filter: CashFlowFilters["status"]): boolean {
  if (!filter) return true;
  return Array.isArray(filter) ? filter.length === 0 || filter.includes(movementStatus) : movementStatus === filter;
}

function matchesFilters(movement: CashFlowMovement, filters: CashFlowFilters = {}) {
  return (
    (!filters.businessUnitId || movement.businessUnitId === filters.businessUnitId) &&
    (!filters.accountingAccountId || movement.accountingAccountId === filters.accountingAccountId) &&
    matchesStatus(movement.status, filters.status) &&
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

function latestConfirmedBalance(openingBalances: CashFlowOpeningBalance[], startDate: Date) {
  const latest = openingBalances
    .filter((balance) => !balance.deletedAt && balance.balanceDate <= startDate)
    .sort((a, b) => b.balanceDate.getTime() - a.balanceDate.getTime())[0];

  return latest ? { amount: decimal(latest.amount), date: latest.balanceDate } : null;
}

export function calculateOpeningBalance(openingBalances: CashFlowOpeningBalance[], startDate: Date): Prisma.Decimal {
  return latestConfirmedBalance(openingBalances, startDate)?.amount ?? new Prisma.Decimal(0);
}

/**
 * Suma el flujo Real (Parcial + Pagado/Cobrado, igual que Modo Real) entre
 * dos fechas, sin desglosar por dia: se usa para "poner al dia" el saldo
 * inicial con lo cobrado/pagado en semanas que ya quedaron fuera del rango
 * visible (que siempre empieza en "hoy") sin haber sido confirmadas a
 * tiempo. Asi el saldo base de Proyectado y del saldo diario actual no
 * queda atrasado solo porque nadie llego a confirmar esa semana antes de
 * que pasara.
 */
function calculateRealNetFlow(
  movements: CashFlowMovement[],
  filters: CashFlowFilters | undefined,
  fromDate: Date,
  toDate: Date,
  holidaySet: Set<string>
): Prisma.Decimal {
  let total = new Prisma.Decimal(0);
  if (fromDate > toDate) return total;

  for (const movement of movements.filter((item) => !item.deletedAt && !item.cancelledAt && item.status !== "CANCELLED")) {
    if (!matchesFilters(movement, filters) || !realEligibleStatuses.includes(movement.status)) {
      continue;
    }

    const sign = movement.type === "INCOME" ? 1 : -1;
    const active = movement.payments.filter((payment) => !payment.deletedAt && !payment.cancelledAt);

    if (active.length > 0) {
      for (const payment of active) {
        const paymentDate = moveToNextBusinessDay(payment.paidAt, holidaySet);
        if (paymentDate >= fromDate && paymentDate <= toDate) {
          total = total.plus(decimal(payment.amount).mul(sign));
        }
      }
    } else {
      const projectedDate = moveToNextBusinessDay(movement.projectedDate, holidaySet);
      if (projectedDate >= fromDate && projectedDate <= toDate) {
        total = total.plus(decimal(movement.projectedAmountClp).mul(sign));
      }
    }
  }

  return total;
}

export function calculateCashFlowByBusinessDay(
  movements: CashFlowMovement[],
  openingBalances: CashFlowOpeningBalance[],
  options: CashFlowOptions
): CashFlowResult {
  const { startDate, endDate } = normalizeRange(options);
  const holidaySet = new Set(options.holidays ?? []);
  const confirmed = latestConfirmedBalance(openingBalances, startDate);
  /**
   * El saldo confirmado representa el saldo al INICIO de confirmed.date
   * (antes de los movimientos de ese mismo dia), asi que la ventana de
   * catch-up debe incluir ese dia completo, no solo los dias posteriores:
   * de lo contrario, si la confirmacion es justo el dia anterior a "hoy",
   * los movimientos reales de ese dia anterior quedan sin sumarse.
   */
  const catchUpRealNetFlow =
    confirmed && confirmed.date < startDate
      ? calculateRealNetFlow(movements, options.filters, confirmed.date, addDays(startDate, -1), holidaySet)
      : new Prisma.Decimal(0);
  const openingBalance = (confirmed?.amount ?? new Prisma.Decimal(0)).plus(catchUpRealNetFlow);
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
    const active = movement.payments.filter((payment) => !payment.deletedAt && !payment.cancelledAt);

    /**
     * Pronostico completo (fullProjected): la parte ya pagada/cobrada se
     * ubica en la fecha de cada pago (igual que Real), para que Proyectado
     * converja a Real a medida que los movimientos se resuelven -- tanto en
     * Pagado/Cobrado (donde cubre el total) como en Parcial (donde cubre
     * los abonos). En Parcial, ademas, solo el SALDO PENDIENTE queda en la
     * fecha proyectada: proyectar el monto total alli duplicaba en el
     * futuro plata que ya se pago/neteo (ej. un pago parcial neteado contra
     * el cobro parcial de un ingreso), mostrando una caja proyectada menor
     * que la real entre las fechas proyectadas del egreso y del ingreso.
     * Los estados sin pagos (Proyectado, Pendiente, Vencido) siguen usando
     * la fecha y monto proyectados originales.
     */
    if (active.length > 0) {
      for (const payment of active) {
        const day = dayByKey.get(dateKey(moveToNextBusinessDay(payment.paidAt, holidaySet)));
        if (day) {
          addFullProjectedEntry(day, movement, decimal(payment.amount));
        }
      }
      if (movement.status !== "PAID_OR_COLLECTED" && projectedDay) {
        const paid = active.reduce((sum, payment) => sum.plus(decimal(payment.amount)), new Prisma.Decimal(0));
        const pendingBalance = decimal(movement.projectedAmountClp).minus(paid);
        if (pendingBalance.gt(0)) {
          addFullProjectedEntry(projectedDay, movement, pendingBalance);
        }
      }
    } else if (projectedDay) {
      addFullProjectedEntry(projectedDay, movement, decimal(movement.projectedAmountClp));
    }

    if (active.length > 0) {
      for (const payment of active) {
        const day = dayByKey.get(dateKey(moveToNextBusinessDay(payment.paidAt, holidaySet)));
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
