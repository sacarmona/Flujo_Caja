import type { Currency, MovementStatus, MovementType } from "@prisma/client";
import { calculateSantanderCashFlow } from "@/lib/cash-flow-service";
import {
  buildCalendarRows,
  buildMovementTooltipIndex,
  calendarAccumulatedBalances,
  calendarMode,
  calendarMonths,
  groupDaysByWeek,
  mondayOfWeek,
  type CalendarMode
} from "@/lib/calendar-view";
import { dateKey } from "@/lib/recurrences";
import { todayInAppTimeZone } from "@/lib/format";
import { getHolidayKeys } from "@/lib/holidays-cl";
import { effectiveOpeningBalance, suggestedOpeningBalanceWeek } from "@/lib/opening-balances";
import { prisma } from "@/lib/prisma";

export type CalendarSearchParams = {
  months?: string;
  mode?: CalendarMode;
  collapsed?: string;
  businessUnitId?: string;
  accountingAccountId?: string;
  status?: MovementStatus;
  type?: MovementType;
  currency?: Currency;
};

async function getReferenceData(companyId: string) {
  const [businessUnits, accounts] = await Promise.all([
    prisma.businessUnit.findMany({ where: { companyId, isActive: true, deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.accountingAccount.findMany({
      where: { companyId, deletedAt: null, allowMovements: true },
      include: { parent: true },
      orderBy: [{ code: "asc" }]
    })
  ]);

  return { businessUnits, accounts };
}

async function getMovementTooltips(companyId: string, filters: CalendarSearchParams, startDate: Date, endDate: Date) {
  const movements = await prisma.movement.findMany({
    where: {
      companyId,
      deletedAt: null,
      cancelledAt: null,
      status: { not: "CANCELLED" },
      bankAccount: { name: "Cuenta Corriente Santander" },
      projectedDate: { gte: startDate, lte: endDate },
      ...(filters.businessUnitId ? { businessUnitId: filters.businessUnitId } : {}),
      ...(filters.accountingAccountId ? { accountingAccountId: filters.accountingAccountId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.currency ? { currency: filters.currency } : {})
    },
    select: { description: true, projectedAmountClp: true, accountingAccountId: true, projectedDate: true }
  });

  return buildMovementTooltipIndex(
    movements.map((movement) => ({
      description: movement.description,
      amount: movement.projectedAmountClp,
      accountingAccountId: movement.accountingAccountId,
      projectedDate: movement.projectedDate
    }))
  );
}

/**
 * Toda la data que necesitan tanto la vista de Calendario (page.tsx) como el
 * export a Excel (export/route.ts), calculada una sola vez a partir de los
 * mismos filtros, para que el archivo descargado siempre coincida
 * exactamente con lo que se ve en pantalla. collapsedCategories siempre
 * viene vacio en el export (el Excel siempre trae el detalle completo, sin
 * importar que categorias esten colapsadas en la vista).
 */
export async function getCalendarData(companyId: string, filters: CalendarSearchParams, options: { collapsedCategories?: Set<string> } = {}) {
  const months = calendarMonths(filters.months);
  const mode = calendarMode(filters.mode);
  const today = todayInAppTimeZone();
  const startDate = mondayOfWeek(today);
  const collapsed = options.collapsedCategories ?? new Set<string>();

  const [referenceData, holidays, lateMovementsCount] = await Promise.all([
    getReferenceData(companyId),
    getHolidayKeys(prisma),
    prisma.movement.count({
      where: { companyId, deletedAt: null, status: { in: ["PROJECTED", "PENDING"] }, projectedDate: { lt: today } }
    })
  ]);

  const result = await calculateSantanderCashFlow({
    prisma,
    companyId,
    startDate,
    months,
    holidays,
    filters: {
      businessUnitId: filters.businessUnitId,
      accountingAccountId: filters.accountingAccountId,
      status: filters.status,
      type: filters.type,
      currency: filters.currency
    }
  });

  const movementTooltips = await getMovementTooltips(companyId, filters, result.days[0]?.date ?? startDate, result.days.at(-1)?.date ?? startDate);

  const accounts = referenceData.accounts.map((account) => ({
    id: account.id,
    code: account.code,
    name: account.name,
    parentName: account.parent?.name ?? "Sin categoria",
    parentCode: account.parent?.code ?? "9999"
  }));
  const rows = buildCalendarRows(accounts, collapsed);
  const weeks = groupDaysByWeek(result.days);
  const balances = calendarAccumulatedBalances(result.days, mode, result.openingBalance, result.confirmedBalances);
  const suggestedOpening = suggestedOpeningBalanceWeek(result, weeks);
  const confirmedForSuggestedWeek = suggestedOpening ? result.confirmedBalances.get(dateKey(suggestedOpening.date)) : undefined;
  const headlineOpeningBalance = effectiveOpeningBalance(result);
  const currentDay = [...result.days].reverse().find((day) => day.date <= today) ?? result.days[0];
  const currentRealBalance = currentDay
    ? (calendarAccumulatedBalances(result.days, "real", result.openingBalance, result.confirmedBalances).get(dateKey(currentDay.date)) ??
      result.openingBalance)
    : result.openingBalance;

  return {
    months,
    mode,
    today,
    startDate,
    referenceData,
    lateMovementsCount,
    result,
    movementTooltips,
    rows,
    weeks,
    balances,
    suggestedOpening,
    confirmedForSuggestedWeek,
    headlineOpeningBalance,
    currentDay,
    currentRealBalance
  };
}
