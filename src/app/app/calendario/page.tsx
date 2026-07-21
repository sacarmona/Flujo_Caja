import Link from "next/link";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CheckCircle2, CircleDot, Download, WalletCards } from "lucide-react";
import type { MovementStatus, MovementType } from "@prisma/client";
import { getCalendarData, type CalendarSearchParams } from "@/app/app/calendario/data";
import { calendarCellAmount, calendarStatusToken, cellTooltip, movementCellHref, type CalendarMode } from "@/lib/calendar-view";
import { dateKey } from "@/lib/recurrences";
import { SavedBanner } from "@/components/saved-banner";
import { formatCurrency } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { movementCurrencies, movementStatuses, movementTypes } from "@/lib/movements";
import { canManageOpeningBalances, dateInputValue } from "@/lib/opening-balances";
import { removeOpeningBalanceAction, updateOpeningBalanceAction } from "./actions";

type SearchParams = CalendarSearchParams;

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
  pending: "Pendiente",
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

  /**
   * La grilla siempre arranca el lunes de la semana en curso (no "hoy"), asi
   * los usuarios ven tambien los dias ya pasados de esta semana. Solo avanza
   * al iniciar la semana siguiente, no dia a dia.
   */
  const collapsed = new Set((filters.collapsed ?? "").split("|").filter(Boolean));
  const {
    months,
    mode,
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
  } = await getCalendarData(user.companyId, filters, { collapsedCategories: collapsed });
  const lastWeekStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() - 7);
  const lastWeekEnd = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() - 1);
  const canEditOpeningBalance = canManageOpeningBalances(user.role);
  /** Mismos filtros que la vista actual (sin "collapsed", que no aplica al Excel: el export siempre trae el detalle completo). */
  const exportQuery = new URLSearchParams(
    Object.entries({ ...filters, collapsed: undefined }).filter((entry): entry is [string, string] => Boolean(entry[1]))
  ).toString();

  return (
    <section className="max-w-none">
      <SavedBanner />
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold text-adentu-ink">Calendario</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Vista de flujo por dia habil basada en el motor de caja. Las celdas abren Movimientos filtrados por fecha y cuenta.
        </p>
      </div>

      {lateMovementsCount > 0 ? (
        <Link
          className="mt-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
          href="/app/movimientos?late=true"
        >
          <AlertTriangle className="size-4 shrink-0" />
          {lateMovementsCount} {lateMovementsCount === 1 ? "movimiento atrasado" : "movimientos atrasados"} sin gestionar
        </Link>
      ) : null}

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

      <div className="mt-3 flex justify-end">
        <Link
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-adentu-blue hover:text-adentu-blue"
          href={`/app/calendario/export?${exportQuery}`}
        >
          <Download aria-hidden className="size-3.5" />
          Descargar Excel
        </Link>
      </div>

      <section className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <span className="rounded-md bg-adentu-mist p-2 text-adentu-blue">
          <WalletCards className="size-5" aria-hidden="true" />
        </span>

        <div>
          <h2 className="text-xs font-semibold text-slate-600">Saldo inicial Santander</h2>
          <p className="text-xl font-semibold text-adentu-ink">{formatCurrency(Number(headlineOpeningBalance))}</p>
        </div>

        {currentDay ? (
          <>
            <span className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden="true" />
            <div>
              <h2 className="text-xs font-semibold text-slate-600">Saldo diario actual ({dateLabel(currentDay.date)})</h2>
              <p className="text-xl font-semibold text-adentu-teal">{formatCurrency(Number(currentRealBalance))}</p>
            </div>
          </>
        ) : null}

        {suggestedOpening ? (
          <>
            <span className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <p className="text-xs text-slate-600">
                Semana {dateLabel(suggestedOpening.date)} calculada en {formatCurrency(Number(suggestedOpening.amount))}
              </p>
              {confirmedForSuggestedWeek ? (
                <p className="text-[11px] font-medium text-amber-700">
                  Confirmado: {formatCurrency(Number(confirmedForSuggestedWeek))}
                  {!confirmedForSuggestedWeek.eq(suggestedOpening.amount) ? " (distinto del calculado)" : null}
                </p>
              ) : null}
              {canEditOpeningBalance ? (
                <div className="flex flex-wrap gap-2">
                  <form action={updateOpeningBalanceAction}>
                    <input type="hidden" name="balanceDate" value={dateInputValue(suggestedOpening.date)} />
                    {/* parseOpeningBalanceAmount espera coma decimal (formato chileno); un punto crudo se confunde con separador de miles y multiplica el monto por 100. */}
                    <input type="hidden" name="amount" value={suggestedOpening.amount.toFixed(2).replace(".", ",")} />
                    <input
                      type="hidden"
                      name="note"
                      value={`Saldo confirmado desde Calendario para la semana ${dateInputValue(suggestedOpening.date)}.`}
                    />
                    <button
                      className="rounded-md border border-adentu-blue px-2 py-1 text-xs font-semibold text-adentu-blue transition hover:bg-adentu-mist"
                      type="submit"
                    >
                      Confirmar calculado
                    </button>
                  </form>
                  {confirmedForSuggestedWeek ? (
                    <form action={removeOpeningBalanceAction}>
                      <input type="hidden" name="balanceDate" value={dateInputValue(suggestedOpening.date)} />
                      <button
                        className="rounded-md border border-amber-600 px-2 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                        type="submit"
                      >
                        Quitar saldo confirmado
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        <div className="ml-auto">
          {canEditOpeningBalance ? (
            <form action={updateOpeningBalanceAction} className="flex flex-wrap items-end gap-2">
              <label className="text-xs">
                <span className="mb-1 block text-slate-600">Fecha</span>
                <input
                  className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  name="balanceDate"
                  type="date"
                  defaultValue={suggestedOpening ? dateInputValue(suggestedOpening.date) : dateInputValue(startDate)}
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-slate-600">Nuevo saldo</span>
                <input
                  className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  name="amount"
                  inputMode="decimal"
                  placeholder="$0"
                />
              </label>
              <input type="hidden" name="note" value="Saldo inicial ingresado manualmente desde Calendario." />
              <button className="rounded-md bg-adentu-blue px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-adentu-teal" type="submit">
                Actualizar
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-600">Solo ADMIN y FINANCE pueden actualizar el saldo inicial.</p>
          )}
        </div>
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1"><ArrowUpCircle className="size-3.5 text-adentu-teal" /> Ingresos pendientes/pagados</span>
          <span className="inline-flex items-center gap-1"><ArrowDownCircle className="size-3.5 text-red-700" /> Egresos pendientes/pagados</span>
          <span className="inline-flex items-center gap-1"><AlertTriangle className="size-3.5 text-red-700" /> Saldo negativo o alerta</span>
        </div>
        <Link
          className="text-sm font-semibold text-adentu-blue"
          href={`/app/movimientos?from=${dateKey(lastWeekStart)}&to=${dateKey(lastWeekEnd)}`}
        >
          Ver movimientos de la semana pasada
        </Link>
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
