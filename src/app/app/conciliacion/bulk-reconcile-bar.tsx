"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { bulkReconcileAction, type BulkRowInput } from "./actions";

const rowSelector = "[data-bulk-row]";

function includedCheckboxes(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`${rowSelector} input[data-bulk-include]`));
}

/**
 * Barra de conciliacion masiva. Cada fila pendiente tiene un checkbox
 * "Incluir" y un formulario de resolucion (data-bulk-form) que el usuario va
 * dejando listo; al pulsar el boton se leen los valores ACTUALES de esos
 * formularios de las filas marcadas y se envian juntos al servidor, en vez de
 * tener que apretar el boton de cada fila.
 */
export function BulkReconcileBar() {
  const [selected, setSelected] = useState(0);
  const [isPending, startTransition] = useTransition();

  const refreshCount = useCallback(() => setSelected(includedCheckboxes().filter((box) => box.checked).length), []);

  useEffect(() => {
    refreshCount();
    document.addEventListener("change", refreshCount);
    return () => document.removeEventListener("change", refreshCount);
  }, [refreshCount]);

  function setAll(checked: boolean) {
    includedCheckboxes().forEach((box) => {
      box.checked = checked;
    });
    refreshCount();
  }

  function collectRows(): BulkRowInput[] {
    const rows: BulkRowInput[] = [];
    document.querySelectorAll<HTMLElement>(rowSelector).forEach((row) => {
      const include = row.querySelector<HTMLInputElement>("input[data-bulk-include]");
      const form = row.querySelector<HTMLFormElement>("form[data-bulk-form]");
      if (!include?.checked || !form) return;
      const values: BulkRowInput = {};
      new FormData(form).forEach((value, key) => {
        if (typeof value === "string") values[key] = value;
      });
      rows.push(values);
    });
    return rows;
  }

  function run() {
    const rows = collectRows();
    if (rows.length === 0) return;
    const confirmed = window.confirm(
      `Se procesaran ${rows.length} fila(s) marcada(s) con los datos que ves en pantalla: se concilian con su movimiento o se crean los movimientos nuevos, y quedan Pagado/Cobrado. Las filas sin marcar no se tocan. ¿Continuar?`
    );
    if (!confirmed) return;
    startTransition(async () => {
      await bulkReconcileAction(rows);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button className="font-semibold text-adentu-blue hover:underline" onClick={() => setAll(true)} type="button">
        Marcar todas
      </button>
      <span className="text-slate-400">·</span>
      <button className="font-semibold text-adentu-blue hover:underline" onClick={() => setAll(false)} type="button">
        Ninguna
      </button>
      <button
        className="rounded-md bg-adentu-teal px-3 py-1.5 font-semibold text-white transition hover:bg-adentu-blue disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isPending || selected === 0}
        onClick={run}
        type="button"
      >
        {isPending ? "Conciliando..." : `Conciliacion masiva (${selected} marcada${selected === 1 ? "" : "s"})`}
      </button>
    </div>
  );
}
