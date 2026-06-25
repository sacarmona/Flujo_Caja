import { Prisma } from "@prisma/client";
import type { MovementStatus, MovementType } from "@prisma/client";
import { createMovementAction, getMovementDefaults } from "@/app/app/movimientos/actions";
import { MovementForm } from "@/app/app/movimientos/movement-form";
import { groupByWeek, movementInclude, statusLabels, typeLabels } from "@/app/app/movimientos/shared";
import { WeeklyMovementsTable } from "@/app/app/movimientos/weekly-movements-table";
import { Pagination } from "@/components/pagination";
import { SavedBanner } from "@/components/saved-banner";
import { calculateSantanderCashFlow } from "@/lib/cash-flow-service";
import { weeklyAccumulatedBalances } from "@/lib/calendar-view";
import { formatCurrency, todayInAppTimeZone } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { getHolidayKeys } from "@/lib/holidays-cl";
import { weekKeyOf } from "@/lib/iso-week";
import { canModifyMovements, movementStatuses, movementTypes } from "@/lib/movements";
import { prisma } from "@/lib/prisma";

const pageSize = 30;

type SearchParams = {
  page?: string;
  from?: string;
  to?: string;
  status?: MovementStatus;
  type?: MovementType;
  accountingAccountId?: string;
  businessUnitId?: string;
  recurrenceRuleId?: string;
  late?: string;
};

type MovimientosPageProps = {
  searchParams: Promise<SearchParams>;
};

function SelectOptions<T extends string>({ values, labels }: { values: readonly T[]; labels: Record<T, string> }) {
  return values.map((value) => (
    <option key={value} value={value}>
      {labels[value]}
    </option>
  ));
}

function optionLabel(code: string | null | undefined, name: string) {
  return code ? `${code} - ${name}` : name;
}

async function getReferenceData(companyId: string) {
  const [accounts, businessUnits, bankAccounts, projects, costCenters] = await Promise.all([
    prisma.accountingAccount.findMany({
      where: {
        companyId,
        isActive: true,
        allowMovements: true,
        deletedAt: null,
        children: { none: {} }
      },
      orderBy: [{ code: "asc" }]
    }),
    prisma.businessUnit.findMany({
      where: { companyId, isActive: true, deletedAt: null },
      orderBy: [{ name: "asc" }]
    }),
    prisma.bankAccount.findMany({
      where: { companyId, isActive: true, deletedAt: null },
      orderBy: [{ name: "asc" }]
    }),
    prisma.project.findMany({
      where: { companyId, isActive: true, deletedAt: null },
      orderBy: [{ name: "asc" }]
    }),
    prisma.costCenter.findMany({
      where: { companyId, isActive: true, deletedAt: null },
      orderBy: [{ name: "asc" }]
    })
  ]);

  return { accounts, businessUnits, bankAccounts, projects, costCenters };
}

function movementsWhere(companyId: string, filters: SearchParams) {
  const late = filters.late === "true";
  return {
    companyId,
    deletedAt: null,
    ...(filters.type ? { type: filters.type } : {}),
    ...(late ? { status: { in: ["PROJECTED", "PENDING"] as MovementStatus[] } } : filters.status ? { status: filters.status } : {}),
    ...(filters.accountingAccountId ? { accountingAccountId: filters.accountingAccountId } : {}),
    ...(filters.businessUnitId ? { businessUnitId: filters.businessUnitId } : {}),
    ...(filters.recurrenceRuleId ? { recurrenceRuleId: filters.recurrenceRuleId } : {}),
    ...(filters.from || filters.to || late
      ? {
          projectedDate: {
            ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000`) } : {}),
            ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999`) } : {}),
            ...(late ? { lt: todayInAppTimeZone() } : {})
          }
        }
      : {})
  };
}

async function getMovements(companyId: string, filters: SearchParams) {
  const page = Math.max(Number(filters.page ?? 1) || 1, 1);
  const where = movementsWhere(companyId, filters);

  const [items, total] = await Promise.all([
    prisma.movement.findMany({
      where,
      include: movementInclude,
      orderBy: [{ projectedDate: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.movement.count({ where })
  ]);

  return { items, total, page, pages: Math.max(Math.ceil(total / pageSize), 1) };
}

/**
 * Saldo acumulado por semana, calculado con el mismo motor que Vista
 * Calendario (saldo inicial + saldos confirmados + flujo por dia habil),
 * para que sea el mismo numero en ambas vistas. Cubre desde la fecha mas
 * antigua hasta la mas reciente entre los movimientos filtrados (y siempre
 * incluye "hoy", igual que Calendario). Si no existe la Cuenta Corriente
 * Santander (requisito del motor de Calendario), no se muestra el saldo en
 * vez de romper el listado completo.
 */
async function getWeeklyBalances(companyId: string, filters: SearchParams) {
  try {
    const where = movementsWhere(companyId, filters);
    const range = await prisma.movement.aggregate({
      where,
      _min: { projectedDate: true },
      _max: { projectedDate: true }
    });

    const today = todayInAppTimeZone();
    const earliest = range._min.projectedDate;
    const latest = range._max.projectedDate;
    const startDate = earliest && earliest < today ? earliest : today;
    const endDate = latest && latest > today ? latest : today;

    const holidays = await getHolidayKeys(prisma);
    const result = await calculateSantanderCashFlow({
      prisma,
      companyId,
      startDate,
      endDate,
      holidays,
      filters: {
        businessUnitId: filters.businessUnitId,
        accountingAccountId: filters.accountingAccountId,
        status: filters.status,
        type: filters.type
      }
    });

    return weeklyAccumulatedBalances(result.days, "projected", result.openingBalance, result.confirmedBalances, weekKeyOf);
  } catch {
    return new Map<string, Prisma.Decimal>();
  }
}

function pageHref(page: number, filters: SearchParams) {
  const params = new URLSearchParams();
  Object.entries({ ...filters, page: String(page) }).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  return `/app/movimientos?${params.toString()}`;
}

export default async function MovimientosPage({ searchParams }: MovimientosPageProps) {
  const filters = await searchParams;
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const [referenceData, defaults, result, weeklyBalances] = await Promise.all([
    getReferenceData(user.companyId),
    getMovementDefaults(user.companyId),
    getMovements(user.companyId, filters),
    getWeeklyBalances(user.companyId, filters)
  ]);
  const canWrite = canModifyMovements(user.role);
  const weeks = groupByWeek(result.items, (movement) => movement.projectedDate).map((week) => {
    const balance = weeklyBalances.get(week.key);
    return { ...week, balanceText: balance ? `Saldo: ${formatCurrency(balance.toNumber())}` : "" };
  });

  return (
    <section className="max-w-7xl">
      <SavedBanner />
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold text-adentu-ink">Movimientos</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Registro de ingresos y egresos proyectados o reales. La cancelacion conserva el registro para auditoria. La columna
          &quot;Fecha&quot; corresponde a la fecha proyectada del movimiento; haz clic en &quot;Ver&quot; para el detalle completo,
          pagos y otros campos.
        </p>
      </div>

      <form className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-8">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Desde</span>
          <input className="w-full rounded-md border border-slate-300 px-2 py-2" name="from" type="date" defaultValue={filters.from ?? ""} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Hasta</span>
          <input className="w-full rounded-md border border-slate-300 px-2 py-2" name="to" type="date" defaultValue={filters.to ?? ""} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Tipo</span>
          <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="type" defaultValue={filters.type ?? ""}>
            <option value="">Todos</option>
            <SelectOptions labels={typeLabels} values={movementTypes} />
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
          <span className="mb-1 block text-slate-600">Cuenta</span>
          <select
            className="w-full rounded-md border border-slate-300 px-2 py-2"
            name="accountingAccountId"
            defaultValue={filters.accountingAccountId ?? ""}
          >
            <option value="">Todas</option>
            {referenceData.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {optionLabel(account.code, account.name)}
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
        <label className="flex items-end gap-2 text-sm text-slate-600">
          <input defaultChecked={filters.late === "true"} name="late" type="checkbox" value="true" />
          Solo atrasados
        </label>
        <button className="self-end rounded-md bg-adentu-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-teal" type="submit">
          Filtrar
        </button>
      </form>

      {canWrite ? (
        <details className="mt-8 group">
          <summary className="cursor-pointer list-none text-lg font-semibold text-adentu-ink">
            <span className="inline-flex items-center gap-2">
              <span className="text-adentu-blue transition-transform group-open:rotate-90">▶</span>
              Crear movimiento
            </span>
          </summary>
          <div className="mt-3">
            <MovementForm
              action={createMovementAction}
              accounts={referenceData.accounts}
              bankAccounts={referenceData.bankAccounts}
              businessUnits={referenceData.businessUnits}
              costCenters={referenceData.costCenters}
              defaults={defaults}
              projects={referenceData.projects}
              submitLabel="Crear"
            />
          </div>
        </details>
      ) : (
        <p className="mt-8 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Tu rol READ_ONLY solo permite revisar movimientos.</p>
      )}

      <div className="mt-10 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-adentu-ink">Listado</h2>
          <p className="text-sm text-slate-500">
            {result.total} registros · Pagina {result.page} de {result.pages}
          </p>
        </div>

        {result.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            No hay movimientos para los filtros seleccionados.
          </div>
        ) : (
          <WeeklyMovementsTable canWrite={canWrite} weeks={weeks} />
        )}

        <div className="flex justify-end">
          <Pagination buildHref={(page) => pageHref(page, filters)} page={result.page} pages={result.pages} />
        </div>
      </div>
    </section>
  );
}
