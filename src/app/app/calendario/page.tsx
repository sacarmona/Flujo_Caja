import Link from "next/link";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CheckCircle2, CircleDot, WalletCards } from "lucide-react";
import type { Currency, MovementStatus, MovementType } from "@prisma/client";
import { calculateSantanderCashFlow } from "@/lib/cash-flow-service";
import {
  buildCalendarRows,
  buildMovementTooltipIndex,
  calendarAccumulatedBalances,
  calendarCellAmount,
  calendarMode,
  calendarMonths,
  calendarStatusToken,
  cellTooltip,
  groupDaysByWeek,
  movementCellHref,
  type CalendarMode
} from "@/lib/calendar-view";
import { dateKey } from "@/lib/recurrences";
import { SavedBanner } from "@/components/saved-banner";
import { formatCurrency, todayInAppTimeZone } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { getHolidayKeys } from "@/lib/holidays-cl";
import { movementCurrencies, movementStatuses, movementTypes } from "@/lib/movements";
import { canManageOpeningBalances, dateInputValue, effectiveOpeningBalance, suggestedOpeningBalanceWeek } from "@/lib/opening-balances";
import { prisma } from "@/lib/prisma";
import { removeOpeningBalanceAction, updateOpeningBalanceAction } from "./actions";

type SearchParams = {
  months?: string;
  mode?: CalendarMode;
  collapsed?: string;
  businessUnitId?: string;
  accountingAccountId?: string;
  status?: MovementStatus;
  type?: MovementType;
  currency?: Currency;
};

type CalendarioPageProps = {
  searchParams: Promise<SearchParams>;
};

const typeLabels: Record<MovementType, string> = {
  INCOME: "Ingreso",
  EXPENSE: "Egreso"
};

const statusLabels: Record<MovementStatus, string> = {
  PROJECTED: "Proyectado",
  PENDING: "Pendiente",
  PARTIALLY_PAID: "Parcial",
  PAID_OR_COLLECTED: "Pagado/Cobrado",
  OVERDUE: "Vencido",
  CANCELLED: "Cancelado"
};

const modeLabels: Record<CalendarMode, string> = {
  projected: "Proyectado",
  real: "Real",
  comparison: "Comparacion"
};

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit" }).format(date);
}

function SelectOptions<T extends string>({ labels, values }: { labels: Record<T, string>; values: readonly T[] }) {
  return values.map((value) => (
    <option key={value} value={value}>
      {labels[value]}
    </option>
  ));
}

function amountClass(amount: { isPositive(): boolean; isNegative(): boolean; isZero(): boolean }) {
  if (amount.isZero()) return "text-slate-400";
  if (amount.isPositive()) return "text-adentu-teal";
  if (amount.isNegative()) return "text-red-700";
  return "text-slate-700";
}

function Indicator({ token }: { token: string }) {
  if (token.includes("saldo negativo")) return <AlertTriangle aria-label="Saldo negativo" className="size-3.5 text-red-700" />;
  if (token.startsWith("ingreso")) return <ArrowUpCircle aria-label="Ingreso" className="size-3.5 text-adentu-teal" />;
  if (token.startsWith("egreso")) return <ArrowDownCircle aria-label="Egreso" className="size-3.5 text-red-700" />;
  if (token === "saldo") return <CheckCircle2 aria-label="Saldo" className="size-3.5 text-adentu-blue" />;
  return <CircleDot aria-label="Sin movimiento" className="size-3.5 text-slate-400" />;
}

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

async function getMovementTooltips(companyId: string, filters: SearchParams, startDate: Date, endDate: Date) {
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

function toggleCollapsedHref(category: string, filters: SearchParams, collapsed: Set<string>) {
  const next = new Set(collapsed);
  if (next.has(category)) next.delete(category);
  else next.add(category);

  const params = new URLSearchParams();
  Object.entries({ ...filters, collapsed: [...next].join("|") }).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `/app/calendario?${params.toString()}`;
}

export default async function CalendarioPage({ searchParams }: CalendarioPageProps) {
  const filters = await searchParams;
  const user = await getCurrentUser();
  if (!user) return null;

  const months = calendarMonths(filters.months);
  const mode = calendarMode(filters.mode);
  const startDate = todayInAppTimeZone();
  const collapsed = new Set((filters.collapsed ?? "").split("|").filter(Boolean));
  const [referenceData, holidays] = await Promise.all([getReferenceData(user.companyId), getHolidayKeys(prisma)]);
  const result = await calculateSantanderCashFlow({
    prisma,
    companyId: user.companyId,
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
  const movementTooltips = await getMovementTooltips(
    user.companyId,
    filters,
    result.days[0]?.date ?? startDate,
    result.days.at(-1)?.date ?? startDate
  );
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
  const canEditOpeningBalance = canManageOpeningBalances(user.role);
  const headlineOpeningBalance = effectiveOpeningBalance(result);

  return (
    <section className="max-w-none">
      <SavedBanner />
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold text-adentu-ink">Calendario</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Vista de flujo por dia habil basada en el motor de caja. Las celdas abren Movimientos filtrados por fecha y cuenta.
        </p>
      </div>

      <form className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-8">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Horizonte</span>
          <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="months" defaultValue={String(months)}>
            {[3, 6, 9, 12].map((value) => (
              <option key={value} value={value}>
                {value} meses
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Modo</span>
          <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="mode" defaultValue={mode}>
            {Object.entries(modeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Unidad</span>
          <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="businessUnitId" defaultValue={filters.businessUnitId ?? ""}>
            <option value="">Todas</option>
            {referenceData.businessUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Cuenta</span>
          <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="accountingAccountId" defaultValue={filters.accountingAccountId ?? ""}>
            <option value="">Todas</option>
            {referenceData.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Estado</span>
          <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="status" defaultValue={filters.status ?? ""}>
            <option value="">Todos</option>
            <SelectOptions labels={statusLabels} values={movementStatuses} />
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Tipo</span>
          <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="type" defaultValue={filters.type ?? ""}>
            <option value="">Todos</option>
            <SelectOptions labels={typeLabels} values={movementTypes} />
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Moneda</span>
          <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="currency" defaultValue={filters.currency ?? ""}>
            <option value="">Todas</option>
            {movementCurrencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
        <button className="self-end rounded-md bg-adentu-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-teal" type="submit">
          Aplicar
        </button>
      </form>

      <section className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex items-start gap-3">
          <span className="rounded-md bg-adentu-mist p-2 text-adentu-blue">
            <WalletCards className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-adentu-ink">Saldo inicial Santander</h2>
            <p className="mt-1 text-2xl font-semibold text-adentu-ink">{formatCurrency(Number(headlineOpeningBalance))}</p>
            {suggestedOpening ? (
              <p className="mt-1 text-xs text-slate-600">
                Semana {dateLabel(suggestedOpening.date)} calculada en {formatCurrency(Number(suggestedOpening.amount))}
              </p>
            ) : null}
            {confirmedForSuggestedWeek ? (
              <p className="mt-1 text-xs font-medium text-amber-700">
                Saldo confirmado/actualizado para esa semana: {formatCurrency(Number(confirmedForSuggestedWeek))}
                {!confirmedForSuggestedWeek.eq(suggestedOpening?.amount ?? 0) ? " (distinto del calculado)" : null}
              </p>
            ) : null}
          </div>
        </div>

        {canEditOpeningBalance ? (
          <div className="grid gap-3 md:grid-cols-[auto_1fr]">
            {suggestedOpening ? (
              <div className="flex flex-wrap items-end gap-2">
                <form action={updateOpeningBalanceAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="balanceDate" value={dateInputValue(suggestedOpening.date)} />
                  {/* parseOpeningBalanceAmount espera coma decimal (formato chileno); un punto crudo se confunde con separador de miles y multiplica el monto por 100. */}
                  <input type="hidden" name="amount" value={suggestedOpening.amount.toFixed(2).replace(".", ",")} />
                  <input
                    type="hidden"
                    name="note"
                    value={`Saldo confirmado desde Calendario para la semana ${dateInputValue(suggestedOpening.date)}.`}
                  />
                  <button
                    className="rounded-md border border-adentu-blue px-3 py-2 text-sm font-semibold text-adentu-blue transition hover:bg-adentu-mist"
                    type="submit"
                  >
                    Confirmar calculado
                  </button>
                </form>
                {confirmedForSuggestedWeek ? (
                  <form action={removeOpeningBalanceAction}>
                    <input type="hidden" name="balanceDate" value={dateInputValue(suggestedOpening.date)} />
                    <button
                      className="rounded-md border border-amber-600 px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
                      type="submit"
                    >
                      Quitar saldo confirmado
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
            <form action={updateOpeningBalanceAction} className="grid gap-2 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(10rem,1fr)_auto]">
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">Fecha</span>
                <input
                  className="w-full rounded-md border border-slate-300 px-2 py-2"
                  name="balanceDate"
                  type="date"
                  defaultValue={suggestedOpening ? dateInputValue(suggestedOpening.date) : dateInputValue(startDate)}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">Nuevo saldo</span>
                <input
                  className="w-full rounded-md border border-slate-300 px-2 py-2"
                  name="amount"
                  inputMode="decimal"
                  placeholder="$0"
                />
              </label>
              <input type="hidden" name="note" value="Saldo inicial ingresado manualmente desde Calendario." />
              <button className="self-end rounded-md bg-adentu-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-teal" type="submit">
                Actualizar
              </button>
            </form>
          </div>
        ) : (
          <p className="self-center text-sm text-slate-600">Solo ADMIN y FINANCE pueden actualizar el saldo inicial.</p>
        )}
      </section>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1"><ArrowUpCircle className="size-3.5 text-adentu-teal" /> Ingresos pendientes/pagados</span>
        <span className="inline-flex items-center gap-1"><ArrowDownCircle className="size-3.5 text-red-700" /> Egresos pendientes/pagados</span>
        <span className="inline-flex items-center gap-1"><AlertTriangle className="size-3.5 text-red-700" /> Saldo negativo o alerta</span>
      </div>

      <div className="mt-6 max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-white shadow-sm">
            <tr>
              <th className="sticky left-0 z-30 min-w-64 border-r border-slate-200 bg-white px-3 py-2 text-left font-semibold text-adentu-ink">
                Concepto
              </th>
              {weeks.map((week) => (
                <th className="border-r border-slate-200 bg-adentu-mist px-3 py-2 text-center font-semibold text-adentu-ink" colSpan={week.days.length} key={week.key}>
                  Semana {dateLabel(week.days[0].date)}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-30 border-r border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-500">
                Saldo inicial {formatCurrency(Number(headlineOpeningBalance))}
              </th>
              {result.days.map((day) => (
                <th className="min-w-28 border-r border-slate-200 px-2 py-2 text-center text-xs font-medium text-slate-600" key={dateKey(day.date)}>
                  {dateLabel(day.date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className={row.kind === "summary" ? "bg-slate-50 font-semibold" : "bg-white hover:bg-slate-50"} key={row.key}>
                <th
                  className={`sticky left-0 z-10 min-w-64 border-r border-t border-slate-200 px-3 py-2 text-left ${
                    row.kind === "summary" ? "bg-slate-50" : "bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2" style={{ paddingLeft: row.level * 16 }}>
                    {row.kind === "category" && row.categoryName ? (
                      <Link className="rounded border border-slate-300 px-1.5 py-0.5 text-xs" href={toggleCollapsedHref(row.categoryName, filters, collapsed)}>
                        {collapsed.has(row.categoryName) ? "+" : "-"}
                      </Link>
                    ) : null}
                    <span>{row.label}</span>
                  </div>
                </th>
                {result.days.map((day) => {
                  const amount = calendarCellAmount(row, day, mode, balances);
                  const href = movementCellHref({
                    date: day.date,
                    accountId: row.accountId,
                    type: row.summary === "income" ? "INCOME" : row.summary === "expense" ? "EXPENSE" : undefined
                  });
                  const token = calendarStatusToken(row, amount);
                  const title = cellTooltip(row, day, token, movementTooltips, formatCurrency);
                  return (
                    <td className="border-r border-t border-slate-200 px-2 py-2 text-right" key={`${row.key}:${dateKey(day.date)}`}>
                      <Link className={`inline-flex items-center justify-end gap-1 whitespace-nowrap ${amountClass(amount)}`} href={href} title={title}>
                        <Indicator token={token} />
                        {formatCurrency(Number(amount))}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
