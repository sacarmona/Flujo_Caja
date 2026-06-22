"use server";

import { revalidatePath } from "next/cache";
import type { AccountingAccountType } from "@prisma/client";
import { assertAdminRole, validateAccountingAccountInput } from "@/lib/accounting-accounts";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirectSaved } from "@/lib/saved-redirect";

const accountTypes = new Set<AccountingAccountType>([
  "INCOME",
  "DIRECT_COST",
  "ADMIN_EXPENSE",
  "TAX",
  "FINANCING",
  "INVESTMENT",
  "NON_OPERATIONAL"
]);

function stringValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalStringValue(formData: FormData, key: string): string | null {
  const value = stringValue(formData, key);
  return value ? value : null;
}

function numberValue(formData: FormData, key: string): number {
  const value = Number(stringValue(formData, key));
  return Number.isFinite(value) ? value : 0;
}

function typeValue(formData: FormData): AccountingAccountType {
  const value = stringValue(formData, "type") as AccountingAccountType;

  if (!accountTypes.has(value)) {
    throw new Error("Tipo de cuenta invalido.");
  }

  return value;
}

async function requireAdmin() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Debes iniciar sesion.");
  }

  assertAdminRole(user.role);
  return user;
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
      entity: "AccountingAccount",
      entityId: params.entityId,
      action: params.action,
      before: params.before === undefined ? undefined : JSON.parse(JSON.stringify(params.before)),
      after: params.after === undefined ? undefined : JSON.parse(JSON.stringify(params.after))
    }
  });
}

export async function createAccountingAccountAction(formData: FormData) {
  const user = await requireAdmin();
  const companyId = user.companyId;
  const parentId = optionalStringValue(formData, "parentId");
  const allAccounts = await prisma.accountingAccount.findMany({ where: { companyId } });

  if (parentId && !allAccounts.some((account) => account.id === parentId)) {
    throw new Error("La cuenta padre no existe.");
  }

  const input = {
    parentId,
    code: stringValue(formData, "code"),
    name: stringValue(formData, "name"),
    type: typeValue(formData),
    sortOrder: numberValue(formData, "sortOrder"),
    isActive: formData.get("isActive") === "on",
    allowMovements: formData.get("allowMovements") === "on"
  };
  const validation = validateAccountingAccountInput(input, allAccounts);

  const created = await prisma.accountingAccount.create({
    data: {
      companyId,
      parentId: input.parentId,
      code: input.code,
      name: input.name,
      type: input.type,
      sortOrder: input.sortOrder,
      level: validation.level,
      isActive: input.isActive,
      allowMovements: validation.allowMovements
    }
  });

  if (parentId) {
    await prisma.accountingAccount.update({
      where: { id: parentId },
      data: { allowMovements: false }
    });
  }

  await writeAudit({ companyId, userId: user.id, entityId: created.id, action: "CREATE", after: created });
  revalidatePath("/app/configuracion");
  await redirectSaved("/app/configuracion");
}

export async function updateAccountingAccountAction(formData: FormData) {
  const user = await requireAdmin();
  const companyId = user.companyId;
  const id = stringValue(formData, "id");
  const parentId = optionalStringValue(formData, "parentId");
  const allAccounts = await prisma.accountingAccount.findMany({ where: { companyId } });
  const current = await prisma.accountingAccount.findFirst({
    where: { id, companyId },
    include: { _count: { select: { children: true, movements: true } } }
  });

  if (!current) {
    throw new Error("La cuenta no existe.");
  }

  if (parentId && !allAccounts.some((account) => account.id === parentId)) {
    throw new Error("La cuenta padre no existe.");
  }

  const input = {
    id,
    parentId,
    code: stringValue(formData, "code"),
    name: stringValue(formData, "name"),
    type: typeValue(formData),
    sortOrder: numberValue(formData, "sortOrder"),
    isActive: formData.get("isActive") === "on",
    allowMovements: formData.get("allowMovements") === "on"
  };
  const validation = validateAccountingAccountInput(input, allAccounts);
  const allowMovements = current._count.children > 0 ? false : validation.allowMovements;

  const updated = await prisma.accountingAccount.update({
    where: { id },
    data: {
      parentId: input.parentId,
      code: input.code,
      name: input.name,
      type: input.type,
      sortOrder: input.sortOrder,
      level: validation.level,
      isActive: input.isActive,
      allowMovements
    }
  });

  if (parentId) {
    await prisma.accountingAccount.update({
      where: { id: parentId },
      data: { allowMovements: false }
    });
  }

  await writeAudit({ companyId, userId: user.id, entityId: id, action: "UPDATE", before: current, after: updated });
  revalidatePath("/app/configuracion");
  await redirectSaved("/app/configuracion");
}
