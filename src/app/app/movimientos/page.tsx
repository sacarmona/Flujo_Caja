import Link from "next/link";
import type { MovementStatus, MovementType } from "@prisma/client";
import {
  cancelMovementAction,
  cancelPaymentAction,
  createMovementAction,
  getMovementDefaults,
  registerPaymentAction,
  updateMovementAction
} from "@/app/app/movimientos/actions";
import { formatCurrency, formatDate } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { canModifyMovements, movementCurrencies, movementStatuses, movementTypes } from "@/lib/movements";
import { pendingBalance, totalPaid } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

const pageSize = 10;

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

type SearchParams = {
  page?: string;
  from?: string;
  to?: string;
  status?: MovementStatus;
  type?: MovementType;
  accountingAccountId?: string;
  businessUnitId?: string;
  recurrenceRuleId?: string;
};

type MovimientosPageProps = {
  searchParams: Promise<SearchParams>;
};

function optionLabel(code: string | null | undefined, name: string) {
  return code ? `${code} - ${name}` : name;
}

function dateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function SelectOptions<T extends string>({ values, labels }: { values: readonly T[]; labels: Record<T, string> }) {
  return values.map((value) => (
    <option key={value} value={value}>
      {labels[value]}
    </option>
  ));
}

function formatAmount(amount: { toString(): string } | number, currency: string) {
  return currency === "CLP" ? formatCurrency(Number(amount)) : `${amount.toString()} ${currency}`;
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
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }]
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

function MovementForm({
  action,
  accounts,
  bankAccounts,
  businessUnits,
  costCenters,
  defaults,
  movement,
  projects,
  submitLabel
}: {
  action: (formData: FormData) => void | Promise<void>;
  accounts: Awaited<ReturnType<typeof getReferenceData>>["accounts"];
  bankAccounts: Awaited<ReturnType<typeof getReferenceData>>["bankAccounts"];
  businessUnits: Awaited<ReturnType<typeof getReferenceData>>["businessUnits"];
  costCenters: Awaited<ReturnType<typeof getReferenceData>>["costCenters"];
  defaults: { bankAccountId: string; businessUnitId: string };
  movement?: Awaited<ReturnType<typeof getMovements>>["items"][number];
  projects: Awaited<ReturnType<typeof getReferenceData>>["projects"];
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-6">
      {movement ? <input name="id" type="hidden" value={movement.id} /> : null}
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Tipo</span>
        <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="type" defaultValue={movement?.type ?? "INCOME"}>
          <SelectOptions labels={typeLabels} values={movementTypes} />
        </select>
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Cuenta contable</span>
        <select
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="accountingAccountId"
          required
          defaultValue={movement?.accountingAccountId ?? ""}
        >
          <option value="">Seleccionar</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {optionLabel(account.code, account.name)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm md:col-span-3">
        <span className="mb-1 block text-slate-600">Descripcion</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="description"
          required
          defaultValue={movement?.description ?? ""}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Monto bruto</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          min="0.01"
          name="amount"
          required
          step="0.01"
          type="number"
          defaultValue={movement?.amount.toString() ?? ""}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Moneda</span>
        <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="currency" defaultValue={movement?.currency ?? "CLP"}>
          {movementCurrencies.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Tasa manual</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          min="0.000001"
          name="manualRate"
          step="0.000001"
          type="number"
          defaultValue={movement?.isManualRate ? movement.projectedRate.toString() : ""}
        />
      </label>
      <label className="text-sm md:col-span-3">
        <span className="mb-1 block text-slate-600">Motivo correccion</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="manualRateReason"
          defaultValue={movement?.manualRateReason ?? ""}
        />
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Cuenta bancaria</span>
        <select
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="bankAccountId"
          required
          defaultValue={movement?.bankAccountId ?? defaults.bankAccountId}
        >
          {bankAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Unidad de Negocio</span>
        <select
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="businessUnitId"
          required
          defaultValue={movement?.businessUnitId ?? defaults.businessUnitId}
        >
          {businessUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Proyecto</span>
        <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="projectId" defaultValue={movement?.projectId ?? ""}>
          <option value="">Sin proyecto</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Centro de costo</span>
        <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="costCenterId" defaultValue={movement?.costCenterId ?? ""}>
          <option value="">Sin centro de costo</option>
          {costCenters.map((costCenter) => (
            <option key={costCenter.id} value={costCenter.id}>
              {optionLabel(costCenter.code, costCenter.name)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Fecha proyectada</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="projectedDate"
          required
          type="date"
          defaultValue={dateInputValue(movement?.projectedDate ?? null)}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Fecha real</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="realDate"
          type="date"
          defaultValue={dateInputValue(movement?.realDate ?? null)}
        />
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Estado</span>
        <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="status" defaultValue={movement?.status ?? "PROJECTED"}>
          <SelectOptions labels={statusLabels} values={movementStatuses} />
        </select>
      </label>
      <label className="text-sm md:col-span-6">
        <span className="mb-1 block text-slate-600">Notas</span>
        <textarea className="w-full rounded-md border border-slate-300 px-2 py-2" name="notes" rows={2} defaultValue={movement?.notes ?? ""} />
      </label>
      <button className="rounded-md bg-adentu-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-teal md:col-span-1" type="submit">
        {submitLabel}
      </button>
    </form>
  );
}

async function getMovements(companyId: string, filters: SearchParams) {
  const page = Math.max(Number(filters.page ?? 1) || 1, 1);
  const where = {
    companyId,
    deletedAt: null,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.accountingAccountId ? { accountingAccountId: filters.accountingAccountId } : {}),
    ...(filters.businessUnitId ? { businessUnitId: filters.businessUnitId } : {}),
    ...(filters.recurrenceRuleId ? { recurrenceRuleId: filters.recurrenceRuleId } : {}),
    ...(filters.from || filters.to
      ? {
          projectedDate: {
            ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000`) } : {}),
            ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999`) } : {})
          }
        }
      : {})
  };

  const [items, total] = await Promise.all([
    prisma.movement.findMany({
      where,
      include: {
        accountingAccount: true,
        bankAccount: true,
        businessUnit: true,
        costCenter: true,
        payments: {
          include: {
            bankAccount: true
          },
          orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }]
        },
        project: true
      },
      orderBy: [{ projectedDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.movement.count({ where })
  ]);

  return { items, total, page, pages: Math.max(Math.ceil(total / pageSize), 1) };
}

function PaymentPanel({
  canWrite,
  movement
}: {
  canWrite: boolean;
  movement: Awaited<ReturnType<typeof getMovements>>["items"][number];
}) {
  const paid = totalPaid(movement.payments);
  const pending = pendingBalance(movement.amount, movement.payments);
  const canRegisterPayment = canWrite && movement.status !== "CANCELLED" && movement.currency === "CLP" && pending.gt(0);

  return (
    <section className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500">Total pagado/cobrado</p>
          <p className="text-base font-semibold text-adentu-ink">{formatCurrency(Number(paid))}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Saldo pendiente</p>
          <p className="text-base font-semibold text-adentu-ink">{formatCurrency(Number(pending))}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Pagos activos</p>
          <p className="text-base font-semibold text-adentu-ink">
            {movement.payments.filter((payment) => !payment.cancelledAt && !payment.deletedAt).length}
          </p>
        </div>
      </div>

      {canRegisterPayment ? (
        <form action={registerPaymentAction} className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-4">
          <input name="movementId" type="hidden" value={movement.id} />
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Monto CLP</span>
            <input
              className="w-full rounded-md border border-slate-300 px-2 py-2"
              max={pending.toString()}
              min="0.01"
              name="amount"
              required
              step="0.01"
              type="number"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Fecha</span>
            <input className="w-full rounded-md border border-slate-300 px-2 py-2" name="paidAt" required type="date" />
          </label>
          <label className="text-sm md:col-span-1">
            <span className="mb-1 block text-slate-600">Referencia</span>
            <input className="w-full rounded-md border border-slate-300 px-2 py-2" name="reference" />
          </label>
          <button className="self-end rounded-md bg-adentu-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-teal" type="submit">
            Registrar pago/cobro
          </button>
        </form>
      ) : null}

      {movement.currency !== "CLP" ? (
        <p className="mt-4 text-sm text-slate-500">Los pagos de movimientos en {movement.currency} se habilitaran cuando exista tipo de cambio.</p>
      ) : null}

      <div className="mt-4">
        <h4 className="text-sm font-semibold text-adentu-ink">Historial de pagos</h4>
        {movement.payments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Sin pagos registrados.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {movement.payments.map((payment) => (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3" key={payment.id}>
                <div>
                  <p className="text-sm font-semibold text-adentu-ink">
                    {formatCurrency(Number(payment.amount))} · {formatDate(payment.paidAt)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {payment.bankAccount.name} · CLP tasa 1
                    {payment.reference ? ` · Ref. ${payment.reference}` : ""}
                    {payment.cancelledAt ? ` · Anulado ${formatDate(payment.cancelledAt)}` : ""}
                  </p>
                </div>
                {canWrite && !payment.cancelledAt && !payment.deletedAt ? (
                  <form action={cancelPaymentAction} className="flex flex-wrap gap-2">
                    <input name="paymentId" type="hidden" value={payment.id} />
                    <input className="rounded-md border border-slate-300 px-2 py-1 text-sm" name="cancelReason" placeholder="Motivo" />
                    <button className="rounded-md border border-red-300 px-3 py-1 text-sm font-semibold text-red-700 transition hover:bg-red-50" type="submit">
                      Anular
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
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

  const [referenceData, defaults, result] = await Promise.all([
    getReferenceData(user.companyId),
    getMovementDefaults(user.companyId),
    getMovements(user.companyId, filters)
  ]);
  const canWrite = canModifyMovements(user.role);

  return (
    <section className="max-w-7xl">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold text-adentu-ink">Movimientos</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Registro de ingresos y egresos proyectados o reales. La cancelacion conserva el registro para auditoria.
        </p>
      </div>

      <form className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-7">
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
        <button className="self-end rounded-md bg-adentu-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-teal" type="submit">
          Filtrar
        </button>
      </form>

      {canWrite ? (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-adentu-ink">Crear movimiento</h2>
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
          result.items.map((movement) => (
            <article className="rounded-lg border border-slate-200 bg-white p-4" key={movement.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-slate-200 px-2 py-1 text-xs">{typeLabels[movement.type]}</span>
                    <span className="rounded border border-slate-200 px-2 py-1 text-xs">{statusLabels[movement.status]}</span>
                    <h3 className="font-semibold text-adentu-ink">{movement.description}</h3>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {optionLabel(movement.accountingAccount.code, movement.accountingAccount.name)} · {movement.businessUnit.name} ·{" "}
                    {movement.bankAccount.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Proyectada {formatDate(movement.projectedDate)}
                    {movement.realDate ? ` · Real ${formatDate(movement.realDate)}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-adentu-ink">
                    {formatAmount(movement.amount, movement.currency)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Tasa {movement.projectedRate.toString()} · CLP {formatCurrency(Number(movement.projectedAmountClp))}
                  </p>
                  <p className="text-xs text-slate-500">
                    {movement.exchangeRateSource}
                    {movement.isManualRate ? ` · Manual: ${movement.manualRateReason ?? "sin motivo"}` : ""}
                  </p>
                  {movement.cancelledAt ? <p className="text-xs text-slate-500">Cancelado {formatDate(movement.cancelledAt)}</p> : null}
                </div>
              </div>

              <PaymentPanel canWrite={canWrite} movement={movement} />

              {canWrite && movement.status !== "CANCELLED" ? (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-adentu-blue">Editar movimiento</summary>
                  <div className="mt-3">
                    <MovementForm
                      action={updateMovementAction}
                      accounts={referenceData.accounts}
                      bankAccounts={referenceData.bankAccounts}
                      businessUnits={referenceData.businessUnits}
                      costCenters={referenceData.costCenters}
                      defaults={defaults}
                      movement={movement}
                      projects={referenceData.projects}
                      submitLabel="Guardar"
                    />
                    <form action={cancelMovementAction} className="mt-3 flex flex-wrap gap-2">
                      <input name="id" type="hidden" value={movement.id} />
                      <input
                        className="min-w-72 flex-1 rounded-md border border-slate-300 px-2 py-2 text-sm"
                        name="cancelReason"
                        placeholder="Motivo de cancelacion"
                      />
                      <button className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50" type="submit">
                        Cancelar sin borrar
                      </button>
                    </form>
                  </div>
                </details>
              ) : null}
            </article>
          ))
        )}

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
