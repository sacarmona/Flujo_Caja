"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirectSaved } from "@/lib/saved-redirect";
import { assertCanManageVendors, validateVendorInput, type VendorFormInput } from "@/lib/vendors";

function stringValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalStringValue(formData: FormData, key: string): string | null {
  const value = stringValue(formData, key);
  return value ? value : null;
}

function formInput(formData: FormData): VendorFormInput {
  return {
    category: stringValue(formData, "category"),
    name: stringValue(formData, "name"),
    referenceInstallment: stringValue(formData, "referenceInstallment"),
    dueDay: stringValue(formData, "dueDay"),
    initialDebtClp: stringValue(formData, "initialDebtClp"),
    notes: optionalStringValue(formData, "notes")
  };
}

async function requireVendorManager() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Debes iniciar sesion.");
  }
  assertCanManageVendors(user.role);
  return user;
}

async function audit(params: {
  companyId: string;
  userId: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "CANCEL";
  before?: unknown;
  after?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      companyId: params.companyId,
      userId: params.userId,
      entity: "Vendor",
      entityId: params.entityId,
      action: params.action,
      before: params.before === undefined ? undefined : JSON.parse(JSON.stringify(params.before)),
      after: params.after === undefined ? undefined : JSON.parse(JSON.stringify(params.after))
    }
  });
}

export async function createVendorAction(formData: FormData) {
  const user = await requireVendorManager();
  const data = validateVendorInput(formInput(formData));

  const created = await prisma.vendor.create({
    data: { companyId: user.companyId, ...data }
  });

  await audit({ companyId: user.companyId, userId: user.id, entityId: created.id, action: "CREATE", after: created });
  revalidatePath("/app/proveedores");
  await redirectSaved("/app/proveedores");
}

export async function updateVendorAction(formData: FormData) {
  const user = await requireVendorManager();
  const id = stringValue(formData, "id");
  const current = await prisma.vendor.findFirst({ where: { id, companyId: user.companyId } });
  if (!current) {
    throw new Error("El proveedor no existe.");
  }

  const data = validateVendorInput(formInput(formData));
  const updated = await prisma.vendor.update({ where: { id }, data });

  await audit({ companyId: user.companyId, userId: user.id, entityId: id, action: "UPDATE", before: current, after: updated });
  revalidatePath("/app/proveedores");
  await redirectSaved("/app/proveedores");
}

export async function setVendorActiveAction(formData: FormData) {
  const user = await requireVendorManager();
  const id = stringValue(formData, "id");
  const active = stringValue(formData, "active") === "true";
  const current = await prisma.vendor.findFirst({ where: { id, companyId: user.companyId } });

  if (!current) {
    throw new Error("El proveedor no existe.");
  }

  const updated = await prisma.vendor.update({
    where: { id },
    data: { isActive: active }
  });

  await audit({
    companyId: user.companyId,
    userId: user.id,
    entityId: id,
    action: active ? "UPDATE" : "CANCEL",
    before: current,
    after: updated
  });
  revalidatePath("/app/proveedores");
  await redirectSaved("/app/proveedores");
}
