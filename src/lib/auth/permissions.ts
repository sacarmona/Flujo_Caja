export type Role = "ADMIN" | "FINANCE" | "MOVEMENT_ENTRY" | "READ_ONLY";

export type Permission =
  | "users:manage"
  | "business-units:manage"
  | "projects:manage"
  | "cost-centers:manage"
  | "accounts:manage"
  | "bank-accounts:manage"
  | "recurrences:manage"
  | "bank-import:run"
  | "reconciliation:confirm"
  | "audit:view"
  | "movements:read"
  | "movements:write"
  | "movements:export";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [
    "users:manage",
    "business-units:manage",
    "projects:manage",
    "cost-centers:manage",
    "accounts:manage",
    "bank-accounts:manage",
    "recurrences:manage",
    "bank-import:run",
    "reconciliation:confirm",
    "audit:view",
    "movements:read",
    "movements:write",
    "movements:export",
  ],
  FINANCE: [
    "recurrences:manage",
    "bank-import:run",
    "reconciliation:confirm",
    "movements:read",
    "movements:write",
    "movements:export",
  ],
  MOVEMENT_ENTRY: ["movements:read", "movements:write"],
  READ_ONLY: ["movements:read"],
};

/**
 * Verificación de permisos del lado del servidor. Debe usarse en toda route
 * handler / server action antes de ejecutar una operación — la interfaz solo
 * oculta controles, pero nunca es la única barrera.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`El rol ${role} no tiene el permiso requerido: ${permission}`);
  }
}
