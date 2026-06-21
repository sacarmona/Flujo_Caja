"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCanChangeOwnRole, assertCanManageUsers, parseRole, validateEmail, validatePassword } from "@/lib/users";

const passwordHashCost = 10;

function stringValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function requireAdmin() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Debes iniciar sesion.");
  }

  assertCanManageUsers(user.role);
  return user;
}

function auditSafeUser(record: { id: string; email: string; name: string | null; role: string }) {
  return { id: record.id, email: record.email, name: record.name, role: record.role };
}

async function writeAudit(params: {
  companyId: string;
  userId: string;
  entityId: string;
  action: "CREATE" | "UPDATE";
  before?: unknown;
  after?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      companyId: params.companyId,
      userId: params.userId,
      entity: "User",
      entityId: params.entityId,
      action: params.action,
      before: params.before === undefined ? undefined : JSON.parse(JSON.stringify(params.before)),
      after: params.after === undefined ? undefined : JSON.parse(JSON.stringify(params.after))
    }
  });
}

export async function createUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const email = validateEmail(stringValue(formData, "email"));
  const name = stringValue(formData, "name") || null;
  const role = parseRole(stringValue(formData, "role"));
  const password = stringValue(formData, "password");
  validatePassword(password);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("Ya existe un usuario con ese correo.");
  }

  const passwordHash = await bcrypt.hash(password, passwordHashCost);
  const created = await prisma.user.create({
    data: { companyId: admin.companyId, email, name, role, passwordHash }
  });

  await writeAudit({
    companyId: admin.companyId,
    userId: admin.id,
    entityId: created.id,
    action: "CREATE",
    after: auditSafeUser(created)
  });
  revalidatePath("/app/configuracion");
}

export async function updateUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = stringValue(formData, "id");
  const email = validateEmail(stringValue(formData, "email"));
  const name = stringValue(formData, "name") || null;
  const role = parseRole(stringValue(formData, "role"));
  const password = stringValue(formData, "password");

  const current = await prisma.user.findFirst({ where: { id, companyId: admin.companyId } });
  if (!current) {
    throw new Error("El usuario no existe.");
  }

  assertCanChangeOwnRole(admin.id, id, role);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== id) {
    throw new Error("Ya existe un usuario con ese correo.");
  }

  if (password) {
    validatePassword(password);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      email,
      name,
      role,
      ...(password ? { passwordHash: await bcrypt.hash(password, passwordHashCost) } : {})
    }
  });

  await writeAudit({
    companyId: admin.companyId,
    userId: admin.id,
    entityId: id,
    action: "UPDATE",
    before: auditSafeUser(current),
    after: auditSafeUser(updated)
  });
  revalidatePath("/app/configuracion");
}
