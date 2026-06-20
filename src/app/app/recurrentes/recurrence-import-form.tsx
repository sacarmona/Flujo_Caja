"use client";

import { useActionState } from "react";
import { commitRecurrenceImportAction, previewRecurrenceImportAction } from "@/app/app/recurrentes/actions";
import { recurrenceImportInitialState } from "@/lib/recurrence-import-state";

export function RecurrenceImportForm() {
  const [previewState, previewAction, previewPending] = useActionState(previewRecurrenceImportAction, recurrenceImportInitialState);
  const [commitState, commitAction, commitPending] = useActionState(commitRecurrenceImportAction, recurrenceImportInitialState);

  const validRows = previewState.results?.filter((result) => result.status === "ok") ?? [];

  return (
    <div className="space-y-4">
      <form action={previewAction} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Archivo (CSV o XLSX)</span>
          <input accept=".csv,.xlsx" className="rounded-md border border-slate-300 px-2 py-2 text-sm" name="file" required type="file" />
        </label>
        <button
          className="rounded-md bg-adentu-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-teal disabled:opacity-60"
          disabled={previewPending}
          type="submit"
        >
          {previewPending ? "Procesando..." : "Previsualizar"}
        </button>
        <a className="text-sm font-semibold text-adentu-blue" href="/app/recurrentes/plantilla">
          Descargar plantilla
        </a>
      </form>

      {previewState.status === "error" ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{previewState.message}</p>
      ) : null}

      {previewState.status === "previewed" ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Archivo {previewState.fileName}: {previewState.validCount} filas listas para crear, {previewState.errorCount} con errores.
          </p>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="sticky top-0 bg-adentu-mist">
                  <th className="px-3 py-2 text-left font-semibold text-adentu-ink">Fila</th>
                  <th className="px-3 py-2 text-left font-semibold text-adentu-ink">Resultado</th>
                  <th className="px-3 py-2 text-left font-semibold text-adentu-ink">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {previewState.results?.map((result) => (
                  <tr className="border-t border-slate-200" key={result.rowNumber}>
                    <td className="px-3 py-2 text-slate-600">{result.rowNumber}</td>
                    <td className="px-3 py-2">
                      {result.status === "ok" ? (
                        <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Lista</span>
                      ) : (
                        <span className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">Con errores</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {result.status === "ok" ? result.summary : result.errors.join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {validRows.length > 0 ? (
            <form action={commitAction}>
              <input name="rows" type="hidden" value={JSON.stringify(validRows.map((result) => result.input))} />
              <button
                className="rounded-md bg-adentu-teal px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-blue disabled:opacity-60"
                disabled={commitPending}
                type="submit"
              >
                {commitPending ? "Importando..." : `Confirmar importacion (${validRows.length} reglas)`}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {commitState.status === "committed" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{commitState.message}</p>
      ) : null}
      {commitState.status === "error" ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{commitState.message}</p>
      ) : null}
    </div>
  );
}
