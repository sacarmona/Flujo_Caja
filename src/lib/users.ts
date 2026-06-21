import type { Role } from "@prisma/client";
import { ROLES } from "@/lib/constants";

export function canManageUsers(role: Role): boolean {
  return role === "ADMIN";
}

export function assertCanManageUsers(role: Role): void {
  if (!canManageUsers(role)) {
    throw new Error("Solo ADMIN puede administrar usuarios.");
  }
}

export function parseRole(value: string): Role {
  if (!ROLES.includes(value as Role)) {
    throw new Error("Rol invalido.");
  }

  return value as Role;
}

export function validateEmail(value: string): string {
  const email = value.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("El correo no es valido.");
  }

  return email;
}

export function validatePassword(value: string): void {
  if (value.length < 8) {
    throw new Error("La contrasena debe tener al menos 8 caracteres.");
  }
}

/**
 * Evita que un ADMIN se quite a si mismo el rol de Administrador desde el
 * formulario de edicion: dejaria la cuenta sin nadie con permisos para
 * revertirlo (no hay otra forma de recuperar el rol salvo acceso directo a
 * la base de datos).
 */
export function assertCanChangeOwnRole(currentUserId: string, targetUserId: string, nextRole: Role): void {
  if (currentUserId === targetUserId && nextRole !== "ADMIN") {
    throw new Error("No puedes quitarte el rol de Administrador a ti mismo.");
  }
}
