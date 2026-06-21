/** Separado de recurrentes/actions.ts ("use server") porque ese archivo solo puede exportar funciones async. */
export type GenerateMovementsState =
  | { status: "idle" }
  | { status: "success"; created: number; skipped: number }
  | { status: "partial"; created: number; conversionErrors: string[] }
  | { status: "error"; message: string };

export const generateMovementsInitialState: GenerateMovementsState = { status: "idle" };
