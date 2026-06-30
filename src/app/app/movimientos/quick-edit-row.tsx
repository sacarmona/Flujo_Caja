"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { MovementStatus } from "@prisma/client";
import { cancelAndDeleteMovementAction, quickUpdateMovementAction } from "@/app/app/movimientos/actions";
import { dateInputValue, optionLabel, statusLabels, typeLabels, type MovementWithRelations } from "@/app/app/movimientos/shared";
import { AmountInput } from "@/components/amount-input";
import { formatDate } from "@/lib/format";
import { canCancelAndDeleteMovement } from "@/lib/movements";

const quickEditableStatuses = Object.keys(statusLabels).filter((status) => status !== "CANCELLED") as MovementStatus[];

/**
 * isLate se calcula en el servidor (page.tsx) y se recibe por prop: este es
 * un componente cliente, y comparar fechas con "hoy" calculado en el
 * navegador puede desfasarse un dia segun la zona horaria local del
 * dispositivo (projectedDate se construye en el servidor, en su propia
 * zona); comparar en el mismo lado evita ese desfase.
 */
export function QuickEditRow({ canWrite, isLate, movement }: { canWrite: boolean; isLate: boolean; movement: MovementWithRelations }) {
  const [date, setDate] = useState(dateInputValue(movement.projectedDate));
  const [status, setStatus] = useState(movement.status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const editable = canWrite && movement.status !== "CANCELLED";
  const financialFieldsEditable = editable && movement.status !== "PAID_OR_COLLECTED";
  const canCancelAndDelete = canWrite && canCancelAndDeleteMovement(movement);

  function run(input: { projectedDate?: string; status?: MovementStatus; amount?: string }) {
    setError(null);
    startTransition(async () => {
      try {
        await quickUpdateMovementAction({ id: movement.id, ...input });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "No se pudo guardar el cambio.");
      }
    });
  }

  function cancelAndDelete() {
    const confirmed = window.confirm(
      "Este movimiento se cancelara y dejara de aparecer en el listado. Usa esta opcion solo si fue ingresado por error. ¿Continuar?"
    );
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      try {
        await cancelAndDeleteMovementAction({ id: movement.id, reason: "Ingreso erroneo confirmado desde listado." });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "No se pudo cancelar y borrar el movimiento.");
      }
    });
  }

  return (
    <tr className="border-b border-slate-100 align-top last:border-b-0">
      <td className="whitespace-nowrap px-3 py-2">
        {financialFieldsEditable ? (
          <input
            className="w-32 rounded-md border border-transparent px-1.5 py-1 text-sm hover:border-slate-300 focus:border-adentu-blue focus:outline-none"
            disabled={isPending}
            onBlur={(event) => event.target.value !== dateInputValue(movement.projectedDate) && run({ projectedDate: event.target.value })}
            onChange={(event) => setDate(event.target.value)}
            type="date"
            value={date}
          />
        ) : (
          formatDate(movement.projectedDate)
        )}
      </td>
      <td className="px-3 py-2 text-sm text-adentu-ink">{movement.description}</td>
      <td className="whitespace-nowrap px-3 py-2 text-sm text-slate-600">{typeLabels[movement.type]}</td>
      <td className="px-3 py-2 text-sm text-slate-600">{optionLabel(movement.accountingAccount.code, movement.accountingAccount.name)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {financialFieldsEditable ? (
          <AmountInput
            className="w-28 rounded-md border border-transparent px-1.5 py-1 text-right text-sm hover:border-slate-300 focus:border-adentu-blue focus:outline-none"
            defaultValue={movement.amount.toString()}
            disabled={isPending}
            onBlur={(value) => value !== movement.amount.toString() && run({ amount: value })}
          />
        ) : (
          movement.amount.toString()
        )}
        <span className="ml-1 text-xs text-slate-400">{movement.currency}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        {editable ? (
          <select
            className="rounded-md border border-transparent px-1.5 py-1 text-sm hover:border-slate-300 focus:border-adentu-blue focus:outline-none"
            disabled={isPending}
            onChange={(event) => {
              const value = event.target.value as MovementStatus;
              setStatus(value);
              run({ status: value });
            }}
            value={status}
          >
            {quickEditableStatuses.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </select>
        ) : (
          statusLabels[movement.status]
        )}
        {isLate ? (
          <span className="ml-1.5 rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700">Atrasado</span>
        ) : null}
        {error ? <p className="mt-1 max-w-[12rem] text-xs text-red-600">{error}</p> : null}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          {canCancelAndDelete ? (
            <button
              className="text-sm font-semibold text-red-700 hover:underline disabled:text-slate-400"
              disabled={isPending}
              onClick={cancelAndDelete}
              type="button"
            >
              Borrar
            </button>
          ) : null}
          <Link className="text-sm font-semibold text-adentu-blue hover:underline" href={`/app/movimientos/${movement.id}`}>
            Ver
          </Link>
        </div>
      </td>
    </tr>
  );
}
