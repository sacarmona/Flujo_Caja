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
};

/**
 * before/after se guardan como el registro completo de Movement serializado
 * (sin relaciones). Para mostrar el log usamos after si existe (estado luego
 * de la accion); en una eliminacion logica after sigue siendo el movimiento,
 * solo before queda como respaldo si after no vino.
 */
export function movementAuditSummary(entry: { before: unknown; after: unknown }): MovementAuditSummary {
  const record = (entry.after ?? entry.before) as Record<string, unknown> | null | undefined;

  if (!record || typeof record !== "object") {
    return { description: "(sin datos)", amount: null, type: null };
  }

  return {
    description: typeof record.description === "string" ? record.description : "(sin descripcion)",
    amount: record.amount !== undefined && record.amount !== null ? Number(record.amount) : null,
    type: typeof record.type === "string" ? record.type : null
  };
}
