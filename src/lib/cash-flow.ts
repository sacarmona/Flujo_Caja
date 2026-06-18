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
  realIncome: Prisma.Decimal;
  realExpense: Prisma.Decimal;
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
};

const zeroTotals = (): CashFlowGroupTotals => ({
  projectedIncome: new Prisma.Decimal(0),
  projectedExpense: new Prisma.Decimal(0),
  realIncome: new Prisma.Decimal(0),
  realExpense: new Prisma.Decimal(0)
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

function bucketFor(type: MovementType, isReal: boolean): keyof CashFlowGroupTotals {
  if (type === "INCOME") {
    return isReal ? "realIncome" : "projectedIncome";
  }
  return isReal ? "realExpense" : "projectedExpense";
}

function addEntry(day: CashFlowDay, movement: CashFlowMovement, amount: Prisma.Decimal, isReal: boolean) {
  const bucket = bucketFor(movement.type, isReal);
  addToTotals(day, bucket, amount);
  addToTotals(getTotals(day.byCategory, movementCategory(movement)), bucket, amount);
  addToTotals(getTotals(day.byAccountingAccount, movement.accountingAccount.name), bucket, amount);
  addToTotals(getTotals(day.byBusinessUnit, movement.businessUnit.name), bucket, amount);
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

    const active = movement.payments.filter((payment) => !payment.deletedAt && !payment.cancelledAt);

    if (active.length > 0) {
      for (const payment of active) {
        const paymentDate = moveToNextBusinessDay(payment.paidAt, holidaySet);
        const day = dayByKey.get(dateKey(paymentDate));
        if (day) {
          addEntry(day, movement, decimal(payment.amount), true);
        }
      }
    } else {
      const projectedDate = moveToNextBusinessDay(movement.projectedDate, holidaySet);
      const day = dayByKey.get(dateKey(projectedDate));
      if (day) {
        addEntry(day, movement, decimal(movement.projectedAmountClp), false);
      }
    }
  }

  let accumulated = openingBalance;
  for (const day of days) {
    day.netFlow = day.projectedIncome.plus(day.realIncome).minus(day.projectedExpense).minus(day.realExpense);
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
    week.realIncome = week.realIncome.plus(day.realIncome);
    week.realExpense = week.realExpense.plus(day.realExpense);
    week.netFlow = week.netFlow.plus(day.netFlow);
    weekMap.set(key, week);
  }

  return { openingBalance, days, weeks: [...weekMap.values()] };
}
