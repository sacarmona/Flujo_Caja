import type { AuditAction } from "@prisma/client";

export const auditActionLabels: Record<AuditAction, string> = {
  CREATE: "Creacion",
  UPDATE: "Edicion",
  CANCEL: "Cancelacion",
  SOFT_DELETE: "Eliminacion",
  LOGIN: "Inicio de sesion",
  LOGOUT: "Cierre de sesion"
};

export type MovementAuditSummary = {
  description: string;
  amount: number | null;
  type: string | null;
  projectedDate: Date | null;
};

function parseSnapshotDate(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * before/after se guardan como el registro completo de Movement serializado
 * (sin relaciones). Para mostrar el log usamos after si existe (estado luego
 * de la accion); en una eliminacion logica after sigue siendo el movimiento,
 * solo before queda como respaldo si after no vino.
 *
 * Cuando un movimiento usa tasa de cambio manual, createMovementAction y
 * updateMovementAction (src/app/app/movimientos/actions.ts) registran una
 * SEGUNDA fila de auditoria solo con los campos de tasa (sin descripcion,
 * tipo ni monto, ya que no es el movimiento completo sino el detalle de ese
 * ajuste puntual). Se detecta por la presencia de "isManualRate" para
 * mostrar una etiqueta clara en vez de "(sin descripcion)".
 */
export function movementAuditSummary(entry: { before: unknown; after: unknown }): MovementAuditSummary {
  const record = (entry.after ?? entry.before) as Record<string, unknown> | null | undefined;

  if (!record || typeof record !== "object") {
    return { description: "(sin datos)", amount: null, type: null, projectedDate: null };
  }

  if (typeof record.description !== "string" && "isManualRate" in record) {
    return { description: "Ajuste de tasa de cambio manual", amount: null, type: null, projectedDate: null };
  }

  return {
    description: typeof record.description === "string" ? record.description : "(sin descripcion)",
    amount: record.amount !== undefined && record.amount !== null ? Number(record.amount) : null,
    type: typeof record.type === "string" ? record.type : null,
    projectedDate: parseSnapshotDate(record.projectedDate)
  };
}
