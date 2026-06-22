import type { AuditAction } from "@prisma/client";
import { auditActionLabels, movementAuditSummary } from "@/lib/audit-log";
import { typeLabels } from "@/app/app/movimientos/shared";
import { Pagination } from "@/components/pagination";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const pageSize = 30;

type SearchParams = {
  page?: string;
  action?: AuditAction;
  from?: string;
  to?: string;
};

type BitacoraPageProps = {
  searchParams: Promise<SearchParams>;
};

function parseDateInput(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pageHref(page: number, filters: SearchParams) {
  const params = new URLSearchParams();
  Object.entries({ ...filters, page: String(page) }).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  return `/app/bitacora?${params.toString()}`;
}

async function getMovementAuditLog(companyId: string, filters: SearchParams) {
  const page = Math.max(Number(filters.page ?? 1) || 1, 1);
  const from = parseDateInput(filters.from);
  const to = parseDateInput(filters.to);
  const where = {
    companyId,
    entity: "Movement" as const,
    ...(filters.action ? { action: filters.action } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999) } : {})
          }
        }
      : {})
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.auditLog.count({ where })
  ]);

  return { items, total, page, pages: Math.max(Math.ceil(total / pageSize), 1) };
}

export default async function BitacoraPage({ searchParams }: BitacoraPageProps) {
  const filters = await searchParams;
  const user = await getCurrentUser();
  if (!user) return null;

  const result = await getMovementAuditLog(user.companyId, filters);

  return (
    <section className="max-w-6xl">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold text-adentu-ink">Bitacora de movimientos</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Registro de creaciones, ediciones y eliminaciones de movimientos, con usuario y fecha/hora.
        </p>
      </div>

      <form className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Accion</span>
          <select className="w-full rounded-md border border-slate-300 px-2 py-2" defaultValue={filters.action ?? ""} name="action">
            <option value="">Todas</option>
            {(Object.keys(auditActionLabels) as AuditAction[])
              .filter((action) => action !== "LOGIN" && action !== "LOGOUT")
              .map((action) => (
                <option key={action} value={action}>
                  {auditActionLabels[action]}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Desde</span>
          <input className="w-full rounded-md border border-slate-300 px-2 py-2" defaultValue={filters.from ?? ""} name="from" type="date" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Hasta</span>
          <input className="w-full rounded-md border border-slate-300 px-2 py-2" defaultValue={filters.to ?? ""} name="to" type="date" />
        </label>
        <button className="self-end rounded-md bg-adentu-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-teal" type="submit">
          Filtrar
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-adentu-mist">
              <th className="px-3 py-2 text-left font-semibold text-adentu-ink">Fecha y hora</th>
              <th className="px-3 py-2 text-left font-semibold text-adentu-ink">Usuario</th>
              <th className="px-3 py-2 text-left font-semibold text-adentu-ink">Accion</th>
              <th className="px-3 py-2 text-left font-semibold text-adentu-ink">Movimiento</th>
              <th className="px-3 py-2 text-left font-semibold text-adentu-ink">Fecha movimiento</th>
              <th className="px-3 py-2 text-right font-semibold text-adentu-ink">Monto</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((entry) => {
              const summary = movementAuditSummary(entry);
              return (
                <tr className="border-t border-slate-200" key={entry.id}>
                  <td className="px-3 py-2 text-left text-slate-600">{formatDateTime(entry.createdAt)}</td>
                  <td className="px-3 py-2 text-left text-slate-600">{entry.user?.name ?? entry.user?.email ?? "Sistema"}</td>
                  <td className="px-3 py-2 text-left">
                    <span className="rounded border border-slate-200 px-2 py-1 text-xs">{auditActionLabels[entry.action]}</span>
                  </td>
                  <td className="px-3 py-2 text-left text-adentu-ink">
                    {summary.type ? `${typeLabels[summary.type as keyof typeof typeLabels] ?? summary.type} · ` : ""}
                    {summary.description}
                  </td>
                  <td className="px-3 py-2 text-left text-slate-600">{summary.projectedDate ? formatDate(summary.projectedDate) : "-"}</td>
                  <td className="px-3 py-2 text-right font-medium text-adentu-ink">
                    {summary.amount !== null ? formatCurrency(summary.amount) : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {result.items.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No hay registros para los filtros seleccionados.</div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {result.total} registros · Pagina {result.page} de {result.pages}
        </p>
        <Pagination buildHref={(page) => pageHref(page, filters)} page={result.page} pages={result.pages} />
      </div>
    </section>
  );
}
