import type { RecurrenceFormInput } from "./recurrence-rules";

/**
 * Tipos y estado inicial separados de recurrence-import.ts (que importa
 * exceljs) para que el formulario cliente no arrastre esa libreria al bundle
 * del navegador: cualquier modulo que un "use client" importe se empaqueta
 * completo, aunque solo use una constante.
 */
export type RecurrenceImportRowResult =
  | { rowNumber: number; status: "ok"; input: RecurrenceFormInput; summary: string }
  | { rowNumber: number; status: "error"; errors: string[]; summary: string };

export type RecurrenceImportState = {
  status: "idle" | "previewed" | "committed" | "error";
  fileName?: string;
  results?: RecurrenceImportRowResult[];
  validCount?: number;
  errorCount?: number;
  createdCount?: number;
  message?: string;
};

export const recurrenceImportInitialState: RecurrenceImportState = { status: "idle" };
