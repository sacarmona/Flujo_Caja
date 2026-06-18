export const APP_COMPANY_NAME = "ADENTU Ingeniería SpA";
export const APP_LOCALE = "es-CL";
export const APP_TIME_ZONE = "America/Santiago";
export const BASE_CURRENCY = "CLP";

export const ROLES = ["ADMIN", "FINANCE", "MOVEMENT_ENTRY", "READ_ONLY"] as const;

export type AppRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: "Administrador",
  FINANCE: "Finanzas",
  MOVEMENT_ENTRY: "Ingreso de movimientos",
  READ_ONLY: "Solo lectura"
};
