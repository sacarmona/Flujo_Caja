"use server";

import { Prisma } from "@prisma/client";
import type { Currency, MovementStatus, MovementType, RecurrenceFrequency } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { ExchangeRateProvider } from "@/lib/exchange-rates";
import {
  assertCanManageRecurrences,
  validateRecurrenceInput,
  type RecurrenceFormInput
} from "@/lib/recurrence-rules";
import { generateMovementsForRecurrence } from "@/lib/recurrence-service";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function stringValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalStringValue(formData: FormData, key: string): string | null {
  const value = stringValue(formData, key);
  return value ? value : null;
}

function formInput(formData: FormData): RecurrenceFormInput {
  return {
    type: stringValue(formData, "type") as MovementType,
    accountingAccountId: stringValue(formData, "accountingAccountId"),
    description: stringValue(formData, "description"),
    amount: stringValue(formData, "amount"),
    currency: stringValue(formData, "currency") as Currency,
    bankAccountId: stringValue(formData, "bankAccountId"),
    businessUnitId: stringValue(formData, "businessUnitId"),
    projectId: optionalStringValue(formData, "projectId"),
    costCenterId: optionalStringValue(formData, "costCenterId"),
    frequency: stringValue(formData, "frequency") as RecurrenceFrequency,
    intervalDays: optionalStringValue(formData, "intervalDays"),
    dayOfMonth: optionalStringValue(formData, "dayOfMonth"),
    dayOfWeek: optionalStringValue(formData, "dayOfWeek"),
    startDate: stringValue(formData, "startDate"),
    endDate: optionalStringValue(formData, "endDate"),
    status: stringValue(formData, "status") as MovementStatus,
    notes: optionalStringValue(formData, "notes")
  };
}

async function requireRecurrenceManager() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Debes iniciar sesion.");
  }
  assertCanManageRecurrences(user.role);
  return user;
}

async function references(companyId: string, input: RecurrenceFormInput) {
  const [accountingAccount, bankAccount, businessUnit, project, costCenter] = await Promise.all([
    prisma.accountingAccount.findFirst({
      where: { id: input.accountingAccountId, companyId },
      include: { _count: { select: { children: true } } }
    }),
    prisma.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId } }),
    prisma.businessUnit.findFirst({ where: { id: input.businessUnitId, companyId } }),
    input.projectId ? prisma.project.findFirst({ where: { id: input.projectId, companyId } }) : Promise.resolve(null),
    input.costCenterId ? prisma.costCenter.findFirst({ where: { id: input.costCenterId, companyId } }) : Promise.resolve(null)
  ]);

  return { accountingAccount, bankAccount, businessUnit, project, costCenter };
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
      entity: "RecurrenceRule",
      entityId: params.entityId,
      action: params.action,
      before: params.before === undefined ? undefined : JSON.parse(JSON.stringify(params.before)),
      after: params.after === undefined ? undefined : JSON.parse(JSON.stringify(params.after))
    }
  });
}

class DatabaseExchangeRateProvider implements ExchangeRateProvider {
  constructor(private readonly companyId: string) {}

  async getRate(currency: Currency, date: Date) {
    if (currency === "CLP") {
      return { currency, date, rate: new Prisma.Decimal(1), source: "CLP" };
    }

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const rate = await prisma.exchangeRate.findFirst({
      where: {
        companyId: this.companyId,
        fromCurrency: currency,
        toCurrency: "CLP",
        rateDate: { gte: start, lte: end },
        deletedAt: null
      },
      orderBy: { createdAt: "desc" }
    });

    if (!rate) {
      throw new Error(`No hay tasa ${currency}/CLP para la fecha seleccionada.`);
    }

    return { currency, date, rate: rate.rate, source: rate.source ?? "ExchangeRate" };
  }
}

export async function createRecurrenceAction(formData: FormData) {
  const user = await requireRecurrenceManager();
  const input = formInput(formData);
  const data = validateRecurrenceInput(input, await references(user.companyId, input));
  const created = await prisma.recurrenceRule.create({
    data: {
      companyId: user.companyId,
      ...data
    }
  });

  await audit({ companyId: user.companyId, userId: user.id, entityId: created.id, action: "CREATE", after: created });
  revalidatePath("/app/recurrentes");
}

export async function updateRecurrenceAction(formData: FormData) {
  const user = await requireRecurrenceManager();
  const id = stringValue(formData, "id");
  const current = await prisma.recurrenceRule.findFirst({ where: { id, companyId: user.companyId } });
  if (!current) {
    throw new Error("La recurrencia no existe.");
  }

  const input = formInput(formData);
  const data = validateRecurrenceInput(input, await references(user.companyId, input));
  const updated = await prisma.recurrenceRule.update({
    where: { id },
    data
  });

  await audit({ companyId: user.companyId, userId: user.id, entityId: id, action: "UPDATE", before: current, after: updated });
  revalidatePath("/app/recurrentes");
}

export async function setRecurrenceActiveAction(formData: FormData) {
  const user = await requireRecurrenceManager();
  const id = stringValue(formData, "id");
  const active = stringValue(formData, "active") === "true";
  const confirmed = formData.get("confirmDeactivate") === "on";
  const current = await prisma.recurrenceRule.findFirst({
    where: { id, companyId: user.companyId },
    include: { _count: { select: { movements: true } } }
  });

  if (!current) {
    throw new Error("La recurrencia no existe.");
  }

  if (!active && !confirmed) {
    throw new Error("Debes confirmar la desactivacion.");
  }

  const updated = await prisma.recurrenceRule.update({
    where: { id },
    data: {
      isActive: active,
      deactivatedAt: active ? null : new Date()
    }
  });

  await audit({
    companyId: user.companyId,
    userId: user.id,
    entityId: id,
    action: active ? "UPDATE" : "CANCEL",
    before: current,
    after: updated
  });
  revalidatePath("/app/recurrentes");
}

export async function generateRecurringMovementsAction(formData: FormData) {
  const user = await requireRecurrenceManager();
  const id = stringValue(formData, "id");
  const result = await generateMovementsForRecurrence(id, {
    prisma,
    exchangeRateProvider: new DatabaseExchangeRateProvider(user.companyId),
    months: 12
  });

  await prisma.auditLog.create({
    data: {
      companyId: user.companyId,
      userId: user.id,
      entity: "RecurrenceRule",
      entityId: id,
      action: "UPDATE",
      metadata: result
    }
  });
  revalidatePath("/app/recurrentes");
  revalidatePath("/app/movimientos");
}

export async function getRecurrenceDefaults(companyId: string) {
  const [bankAccount, businessUnit] = await Promise.all([
    prisma.bankAccount.findFirst({
      where: { companyId, name: "Cuenta Corriente Santander", isActive: true, deletedAt: null },
      orderBy: { createdAt: "asc" }
    }),
    prisma.businessUnit.findFirst({
      where: { companyId, name: "Sin asignar", isActive: true, deletedAt: null },
      orderBy: { createdAt: "asc" }
    })
  ]);

  return {
    bankAccountId: bankAccount?.id ?? "",
    businessUnitId: businessUnit?.id ?? ""
  };
}
