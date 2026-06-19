"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { MovementStatus } from "@prisma/client";
import { quickUpdateMovementAction } from "@/app/app/movimientos/actions";
import { dateInputValue, optionLabel, statusLabels, typeLabels, type MovementWithRelations } from "@/app/app/movimientos/shared";
import { AmountInput } from "@/components/amount-input";
import { formatDate } from "@/lib/format";

const quickEditableStatuses = Object.keys(statusLabels).filter((status) => status !== "CANCELLED") as MovementStatus[];

export function QuickEditRow({ canWrite, movement }: { canWrite: boolean; movement: MovementWithRelations }) {
  const [date, setDate] = useState(dateInputValue(movement.projectedDate));
  const [status, setStatus] = useState(movement.status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const editable = canWrite && movement.status !== "CANCELLED";

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

  return (
    <tr className="border-b border-slate-100 align-top last:border-b-0">
      <td className="whitespace-nowrap px-3 py-2">
        {editable ? (
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
        {editable ? (
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
        {error ? <p className="mt-1 max-w-[12rem] text-xs text-red-600">{error}</p> : null}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <Link className="text-sm font-semibold text-adentu-blue hover:underline" href={`/app/movimientos/${movement.id}`}>
          Ver
        </Link>
      </td>
    </tr>
  );
}
