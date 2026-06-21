"use client";

import { useActionState } from "react";
import { generateRecurringMovementsAction } from "@/app/app/recurrentes/actions";
import { generateMovementsInitialState } from "@/lib/generate-movements-state";

export function GenerateMovementsButton({ recurrenceId }: { recurrenceId: string }) {
  const [state, action, pending] = useActionState(generateRecurringMovementsAction, generateMovementsInitialState);

  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <input name="id" type="hidden" value={recurrenceId} />
        <button
          className="rounded-md bg-adentu-teal px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-blue disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Generando..." : "Generar 12 meses"}
        </button>
      </form>

      {state.status === "success" ? (
        <p className="text-sm text-green-700">
          Se generaron {state.created} movimientos ({state.skipped} ya existian).
        </p>
      ) : null}

      {state.status === "partial" ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
          Se generaron {state.created} movimientos. No se pudo obtener la tasa de cambio para {state.conversionErrors.length} fecha(s):{" "}
          {state.conversionErrors.join(" | ")}. Agrega una tasa manual a la regla para esas fechas o reintenta mas tarde.
        </p>
      ) : null}

      {state.status === "error" ? <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">{state.message}</p> : null}
    </div>
  );
}
