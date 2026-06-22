import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelMovementAction, getMovementDefaults, updateMovementAction } from "@/app/app/movimientos/actions";
import { MovementForm } from "@/app/app/movimientos/movement-form";
import { PaymentPanel } from "@/app/app/movimientos/payment-panel";
import { formatAmount, movementInclude, optionLabel, statusLabels, typeLabels } from "@/app/app/movimientos/shared";
import { editThisAndFollowingAction } from "@/app/app/recurrentes/actions";
import { RecurrenceForm } from "@/app/app/recurrentes/recurrence-form";
import { SavedBanner } from "@/components/saved-banner";
import { formatCurrency, formatDate } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { canModifyMovements } from "@/lib/movements";
import { canManageRecurrences } from "@/lib/recurrence-rules";
import { prisma } from "@/lib/prisma";

async function getReferenceData(companyId: string) {
  const [accounts, businessUnits, bankAccounts, projects, costCenters] = await Promise.all([
    prisma.accountingAccount.findMany({
      where: { companyId, isActive: true, allowMovements: true, deletedAt: null, children: { none: {} } },
      orderBy: [{ code: "asc" }]
    }),
    prisma.businessUnit.findMany({ where: { companyId, isActive: true, deletedAt: null }, orderBy: [{ name: "asc" }] }),
    prisma.bankAccount.findMany({ where: { companyId, isActive: true, deletedAt: null }, orderBy: [{ name: "asc" }] }),
    prisma.project.findMany({ where: { companyId, isActive: true, deletedAt: null }, orderBy: [{ name: "asc" }] }),
    prisma.costCenter.findMany({ where: { companyId, isActive: true, deletedAt: null }, orderBy: [{ name: "asc" }] })
  ]);

  return { accounts, businessUnits, bankAccounts, projects, costCenters };
}

export default async function MovimientoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const movement = await prisma.movement.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    include: movementInclude
  });

  if (!movement) {
    notFound();
  }

  const [referenceData, defaults] = await Promise.all([getReferenceData(user.companyId), getMovementDefaults(user.companyId)]);
  const canWrite = canModifyMovements(user.role);
  const canManageRecurrence = canManageRecurrences(user.role);
  const recurrenceRule =
    canManageRecurrence && movement.recurrenceRuleId && movement.recurrenceOccurrenceDate
      ? await prisma.recurrenceRule.findFirst({ where: { id: movement.recurrenceRuleId, companyId: user.companyId } })
      : null;

  return (
    <section className="max-w-5xl">
      <SavedBanner />
      <Link className="text-sm font-semibold text-adentu-blue hover:underline" href="/app/movimientos">
        ← Volver a Movimientos
      </Link>

      <article className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-slate-200 px-2 py-1 text-xs">{typeLabels[movement.type]}</span>
              <span className="rounded border border-slate-200 px-2 py-1 text-xs">{statusLabels[movement.status]}</span>
              <h1 className="text-lg font-semibold text-adentu-ink">{movement.description}</h1>
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
            <p className="text-lg font-semibold text-adentu-ink">{formatAmount(movement.amount, movement.currency)}</p>
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
          <div className="mt-6 border-t border-slate-200 pt-4">
            <h2 className="mb-3 text-sm font-semibold text-adentu-ink">Editar movimiento</h2>
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
              <input className="min-w-72 flex-1 rounded-md border border-slate-300 px-2 py-2 text-sm" name="cancelReason" placeholder="Motivo de cancelacion" />
              <button className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50" type="submit">
                Cancelar sin borrar
              </button>
            </form>
          </div>
        ) : null}

        {recurrenceRule ? (
          <div className="mt-6 border-t border-slate-200 pt-4">
            <h2 className="mb-1 text-sm font-semibold text-adentu-ink">Editar esta y las siguientes ocurrencias</h2>
            <p className="mb-3 text-xs text-slate-500">
              Aplica estos cambios desde la fecha de &quot;Inicio&quot; en adelante (precargada con la fecha de esta ocurrencia,{" "}
              {formatDate(movement.projectedDate)}), sin modificar las ocurrencias anteriores ya generadas. Las ocurrencias futuras ya pagadas o con
              pago parcial no se tocan.
            </p>
            <RecurrenceForm
              action={editThisAndFollowingAction}
              defaults={defaults}
              recurrence={{ ...recurrenceRule, startDate: movement.recurrenceOccurrenceDate ?? recurrenceRule.startDate }}
              referenceData={referenceData}
              submitLabel="Aplicar desde esta fecha"
            />
          </div>
        ) : null}
      </article>
    </section>
  );
}
