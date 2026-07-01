"use client";

import { useState } from "react";
import { AmountInput } from "@/components/amount-input";
import { formatCurrency } from "@/lib/format";
import { splitReconciliationAction } from "./actions";

type SplitCandidate = {
  movementId: string;
  label: string;
  pendingRaw: string;
};

/**
 * AmountInput es un input no controlado (lee su valor inicial una sola vez
 * de defaultValue); para autocompletar el monto al marcar un movimiento hay
 * que forzar su remontaje cambiando su `key`, no basta con cambiar el prop.
 */
export function SplitReconciliationForm({
  candidates,
  reconciliationId,
  targetAmount
}: {
  candidates: SplitCandidate[];
  reconciliationId: string;
  targetAmount: number;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [resetTokens, setResetTokens] = useState<Record<string, number>>({});

  function toggle(candidate: SplitCandidate) {
    setChecked((prev) => {
      const nextChecked = !prev[candidate.movementId];
      if (nextChecked) {
        setAmounts((current) => ({ ...current, [candidate.movementId]: candidate.pendingRaw }));
        setResetTokens((current) => ({ ...current, [candidate.movementId]: (current[candidate.movementId] ?? 0) + 1 }));
      }
      return { ...prev, [candidate.movementId]: nextChecked };
    });
  }

  const selectedTotal = candidates.reduce((sum, candidate) => {
    if (!checked[candidate.movementId]) return sum;
    return sum + Number(amounts[candidate.movementId] || 0);
  }, 0);
  const selectedCount = candidates.filter((candidate) => checked[candidate.movementId]).length;
  const matches = selectedCount > 0 && selectedTotal === targetAmount;

  return (
    <form action={splitReconciliationAction} className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
      <input name="reconciliationId" type="hidden" value={reconciliationId} />
      <p className="mb-2 text-xs text-slate-600">
        Marca los movimientos que corresponden a esta fila (el monto pendiente se autocompleta, pero puedes ajustarlo). La suma debe
        ser igual a {formatCurrency(targetAmount)}.
      </p>
      <div className="space-y-1.5">
        {candidates.map((candidate) => (
          <label className="flex flex-wrap items-center gap-2" key={candidate.movementId}>
            <input
              checked={!!checked[candidate.movementId]}
              name="movementIds"
              onChange={() => toggle(candidate)}
              type="checkbox"
              value={candidate.movementId}
            />
            <span className="min-w-0 flex-1 truncate">{candidate.label}</span>
            <AmountInput
              className="w-32 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
              defaultValue={amounts[candidate.movementId] ?? ""}
              key={`${candidate.movementId}-${resetTokens[candidate.movementId] ?? 0}`}
              name={`amount_${candidate.movementId}`}
              onRawChange={(value) => setAmounts((current) => ({ ...current, [candidate.movementId]: value }))}
              placeholder="$0"
            />
          </label>
        ))}
      </div>
      {selectedCount > 0 ? (
        <p className={`mt-2 text-xs font-semibold ${matches ? "text-emerald-700" : "text-amber-700"}`}>
          Suma seleccionada: {formatCurrency(selectedTotal)} de {formatCurrency(targetAmount)}
          {matches ? " · coincide" : ""}
        </p>
      ) : null}
      <button className="mt-2 rounded-md bg-adentu-blue px-3 py-1.5 text-xs font-semibold text-white" type="submit">
        Distribuir y confirmar
      </button>
    </form>
  );
}
