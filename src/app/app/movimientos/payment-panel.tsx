import { cancelPaymentAction, registerPaymentAction } from "@/app/app/movimientos/actions";
import type { MovementWithRelations } from "@/app/app/movimientos/shared";
import { formatCurrency, formatDate } from "@/lib/format";
import { pendingBalance, totalPaid } from "@/lib/payments";

export function PaymentPanel({ canWrite, movement }: { canWrite: boolean; movement: MovementWithRelations }) {
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
