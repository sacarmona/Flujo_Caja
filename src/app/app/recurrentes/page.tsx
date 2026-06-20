import Link from "next/link";
import type { MovementType, RecurrenceFrequency } from "@prisma/client";
import {
  createRecurrenceAction,
  generateRecurringMovementsAction,
  getRecurrenceDefaults,
  setRecurrenceActiveAction,
  updateRecurrenceAction
} from "@/app/app/recurrentes/actions";
import { RecurrenceForm } from "@/app/app/recurrentes/recurrence-form";
import { typeLabels } from "@/app/app/movimientos/shared";
import { formatCurrency, formatDate } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { canManageRecurrences, generatedMovementLink, previewRecurrence, recurrenceFrequencies } from "@/lib/recurrence-rules";
import { dateKey } from "@/lib/recurrences";
import { getHolidayKeys } from "@/lib/holidays-cl";
import { movementTypes } from "@/lib/movements";
import { prisma } from "@/lib/prisma";

const pageSize = 10;

const frequencyLabels: Record<RecurrenceFrequency, string> = {
  DAILY: "Diaria",
  BUSINESS_DAYS: "Dias habiles",
  EVERY_N_DAYS: "Cada N dias",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
  QUARTERLY: "Trimestral",
  SEMIANNUAL: "Semestral",
  ANNUAL: "Anual"
};

type SearchParams = {
  page?: string;
  state?: "active" | "inactive";
  frequency?: RecurrenceFrequency;
  accountingAccountId?: string;
  businessUnitId?: string;
  type?: MovementType;
};

type RecurrentesPageProps = {
  searchParams: Promise<SearchParams>;
};

function optionLabel(code: string | null | undefined, name: string) {
  return code ? `${code} - ${name}` : name;
}

function SelectOptions<T extends string>({ labels, values }: { labels: Record<T, string>; values: readonly T[] }) {
  return values.map((value) => (
    <option key={value} value={value}>
      {labels[value]}
    </option>
  ));
}

async function getReferenceData(companyId: string) {
  const [accounts, businessUnits, bankAccounts, projects, costCenters] = await Promise.all([
    prisma.accountingAccount.findMany({
      where: { companyId, isActive: true, allowMovements: true, deletedAt: null, children: { none: {} } },
      orderBy: [{ code: "asc" }]
    }),
    prisma.businessUnit.findMany({ where: { companyId, isActive: true, deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where: { companyId, isActive: true, deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { companyId, isActive: true, deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.costCenter.findMany({ where: { companyId, isActive: true, deletedAt: null }, orderBy: { name: "asc" } })
  ]);

  return { accounts, businessUnits, bankAccounts, projects, costCenters };
}

async function getRecurrences(companyId: string, filters: SearchParams) {
  const page = Math.max(Number(filters.page ?? 1) || 1, 1);
  const where = {
    companyId,
    ...(filters.state === "active" ? { isActive: true } : {}),
    ...(filters.state === "inactive" ? { isActive: false } : {}),
    ...(filters.frequency ? { frequency: filters.frequency } : {}),
    ...(filters.accountingAccountId ? { accountingAccountId: filters.accountingAccountId } : {}),
    ...(filters.businessUnitId ? { businessUnitId: filters.businessUnitId } : {}),
    ...(filters.type ? { type: filters.type } : {})
  };
  const [items, total] = await Promise.all([
    prisma.recurrenceRule.findMany({
      where,
      include: {
        accountingAccount: true,
        bankAccount: true,
        businessUnit: true,
        costCenter: true,
        project: true,
        _count: { select: { movements: { where: { deletedAt: null } } } }
      },
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.recurrenceRule.count({ where })
  ]);

  return { items, total, page, pages: Math.max(Math.ceil(total / pageSize), 1) };
}

function pageHref(page: number, filters: SearchParams) {
  const params = new URLSearchParams();
  Object.entries({ ...filters, page: String(page) }).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  return `/app/recurrentes?${params.toString()}`;
}

export default async function RecurrentesPage({ searchParams }: RecurrentesPageProps) {
  const filters = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const [referenceData, defaults, result, holidays] = await Promise.all([
    getReferenceData(user.companyId),
    getRecurrenceDefaults(user.companyId),
    getRecurrences(user.companyId, filters),
    getHolidayKeys(prisma)
  ]);
  const canManage = canManageRecurrences(user.role);

  return (
    <section className="max-w-7xl">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold text-adentu-ink">Recurrentes</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Reglas para generar movimientos proyectados. Las fechas no habiles se mueven al dia habil siguiente.
        </p>
      </div>

      <form className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-6">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Estado</span>
          <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="state" defaultValue={filters.state ?? ""}>
            <option value="">Todas</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Frecuencia</span>
          <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="frequency" defaultValue={filters.frequency ?? ""}>
            <option value="">Todas</option>
            <SelectOptions labels={frequencyLabels} values={recurrenceFrequencies} />
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Cuenta</span>
          <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="accountingAccountId" defaultValue={filters.accountingAccountId ?? ""}>
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
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Tipo</span>
          <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="type" defaultValue={filters.type ?? ""}>
            <option value="">Todos</option>
            <SelectOptions labels={typeLabels} values={movementTypes} />
          </select>
        </label>
        <button className="self-end rounded-md bg-adentu-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-teal" type="submit">
          Filtrar
        </button>
      </form>

      {canManage ? (
        <details className="mt-8 group">
          <summary className="cursor-pointer list-none text-lg font-semibold text-adentu-ink">
            <span className="inline-flex items-center gap-2">
              <span className="text-adentu-blue transition-transform group-open:rotate-90">▶</span>
              Crear recurrencia
            </span>
          </summary>
          <div className="mt-3">
            <RecurrenceForm action={createRecurrenceAction} defaults={defaults} referenceData={referenceData} submitLabel="Crear" />
          </div>
        </details>
      ) : (
        <p className="mt-8 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Solo ADMIN y FINANCE pueden administrar recurrencias.
        </p>
      )}

      <div className="mt-10 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-adentu-ink">Listado</h2>
          <p className="text-sm text-slate-500">
            {result.total} reglas · Pagina {result.page} de {result.pages}
          </p>
        </div>

        {result.items.map((recurrence) => {
          const preview = previewRecurrence(recurrence, holidays);
          return (
            <article className="rounded-lg border border-slate-200 bg-white p-4" key={recurrence.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-slate-200 px-2 py-1 text-xs">{recurrence.isActive ? "Activa" : "Inactiva"}</span>
                    <span className="rounded border border-slate-200 px-2 py-1 text-xs">{frequencyLabels[recurrence.frequency]}</span>
                    <h3 className="font-semibold text-adentu-ink">{recurrence.description}</h3>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {optionLabel(recurrence.accountingAccount.code, recurrence.accountingAccount.name)} · {recurrence.businessUnit.name} ·{" "}
                    {recurrence.bankAccount.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Inicio {formatDate(recurrence.startDate)}
                    {recurrence.endDate ? ` · Termino ${formatDate(recurrence.endDate)}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-adentu-ink">
                    {recurrence.currency === "CLP" ? formatCurrency(Number(recurrence.amount)) : `${recurrence.amount.toString()} ${recurrence.currency}`}
                  </p>
                  <Link className="text-sm font-semibold text-adentu-blue" href={generatedMovementLink(recurrence.id)}>
                    {recurrence._count.movements} movimientos
                  </Link>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-sm font-semibold text-adentu-ink">Proximas 10 ocurrencias</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {preview.map((item) => {
                    const moved = dateKey(item.occurrenceDate) !== dateKey(item.projectedDate);
                    return (
                      <span className="rounded border border-slate-200 bg-white px-2 py-1 text-xs" key={dateKey(item.occurrenceDate)}>
                        {formatDate(item.projectedDate)}
                        {moved ? ` (movida desde ${formatDate(item.occurrenceDate)})` : ""}
                      </span>
                    );
                  })}
                </div>
              </div>

              {canManage ? (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-adentu-blue">Editar regla</summary>
                  <div className="mt-3">
                    <RecurrenceForm
                      action={updateRecurrenceAction}
                      defaults={defaults}
                      recurrence={recurrence}
                      referenceData={referenceData}
                      submitLabel="Guardar"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={generateRecurringMovementsAction}>
                        <input name="id" type="hidden" value={recurrence.id} />
                        <button className="rounded-md bg-adentu-teal px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-blue" type="submit">
                          Generar 12 meses
                        </button>
                      </form>
                      <form action={setRecurrenceActiveAction} className="flex flex-wrap items-center gap-2">
                        <input name="id" type="hidden" value={recurrence.id} />
                        <input name="active" type="hidden" value={recurrence.isActive ? "false" : "true"} />
                        {recurrence.isActive ? (
                          <label className="flex items-center gap-2 text-sm text-slate-600">
                            <input name="confirmDeactivate" required type="checkbox" />
                            Confirmo desactivar y eliminar movimientos no pagados
                          </label>
                        ) : null}
                        <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-adentu-blue" type="submit">
                          {recurrence.isActive ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                    </div>
                  </div>
                </details>
              ) : null}
            </article>
          );
        })}

        {result.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            No hay recurrencias para los filtros seleccionados.
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          {result.page > 1 ? (
            <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm" href={pageHref(result.page - 1, filters)}>
              Anterior
            </Link>
          ) : null}
          {result.page < result.pages ? (
            <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm" href={pageHref(result.page + 1, filters)}>
              Siguiente
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
