"use server";

import { revalidatePath } from "next/cache";
import type { Currency, MovementStatus, MovementType } from "@prisma/client";
import { assertCanModifyMovements, validateMovementInput, type MovementFormInput } from "@/lib/movements";
import { getCurrentUser } from "@/lib/auth";
import {
  nextRealDateAfterPayment,
  pendingBalance,
  statusFromPayments,
  validatePaymentAmount
} from "@/lib/payments";
import { prisma } from "@/lib/prisma";

function stringValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalStringValue(formData: FormData, key: string): string | null {
  const value = stringValue(formData, key);
  return value ? value : null;
}

function formInput(formData: FormData): MovementFormInput {
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
    projectedDate: stringValue(formData, "projectedDate"),
    realDate: optionalStringValue(formData, "realDate"),
    status: stringValue(formData, "status") as MovementStatus,
    notes: optionalStringValue(formData, "notes")
  };
}

async function requireMovementWriter() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Debes iniciar sesion.");
  }

  assertCanModifyMovements(user.role);
  return user;
}

async function references(companyId: string, input: MovementFormInput) {
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
  entity?: string;
  action: "CREATE" | "UPDATE" | "CANCEL";
  before?: unknown;
  after?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      companyId: params.companyId,
      userId: params.userId,
      entity: params.entity ?? "Movement",
      entityId: params.entityId,
      action: params.action,
      before: params.before === undefined ? undefined : JSON.parse(JSON.stringify(params.before)),
      after: params.after === undefined ? undefined : JSON.parse(JSON.stringify(params.after))
    }
  });
}

export async function createMovementAction(formData: FormData) {
  const user = await requireMovementWriter();
  const input = formInput(formData);
  const data = validateMovementInput(input, await references(user.companyId, input));

  const movement = await prisma.movement.create({
    data: {
      companyId: user.companyId,
      ...data
    }
  });

  await audit({ companyId: user.companyId, userId: user.id, entityId: movement.id, action: "CREATE", after: movement });
  revalidatePath("/app/movimientos");
}

export async function updateMovementAction(formData: FormData) {
  const user = await requireMovementWriter();
  const id = stringValue(formData, "id");
  const current = await prisma.movement.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });

  if (!current) {
    throw new Error("El movimiento no existe.");
  }

  if (current.status === "CANCELLED") {
    throw new Error("No se puede editar un movimiento cancelado.");
  }

  const input = formInput(formData);
  const data = validateMovementInput(input, await references(user.companyId, input));
  const updated = await prisma.movement.update({
    where: { id },
    data
  });

  await audit({ companyId: user.companyId, userId: user.id, entityId: id, action: "UPDATE", before: current, after: updated });
  revalidatePath("/app/movimientos");
}

export async function cancelMovementAction(formData: FormData) {
  const user = await requireMovementWriter();
  const id = stringValue(formData, "id");
  const current = await prisma.movement.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });

  if (!current) {
    throw new Error("El movimiento no existe.");
  }

  const updated = await prisma.movement.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      notes: stringValue(formData, "cancelReason") || current.notes
    }
  });

  await audit({
    companyId: user.companyId,
    userId: user.id,
    entityId: id,
    action: "CANCEL",
    before: current,
    after: updated
  });
  revalidatePath("/app/movimientos");
}

export async function registerPaymentAction(formData: FormData) {
  const user = await requireMovementWriter();
  const movementId = stringValue(formData, "movementId");
  const amountText = stringValue(formData, "amount");
  const paidAt = new Date(`${stringValue(formData, "paidAt")}T00:00:00.000`);
  const reference = optionalStringValue(formData, "reference");

  if (Number.isNaN(paidAt.getTime())) {
    throw new Error("La fecha de pago es obligatoria.");
  }

  await prisma.$transaction(async (tx) => {
    const movement = await tx.movement.findFirst({
      where: { id: movementId, companyId: user.companyId, deletedAt: null },
      include: { payments: true }
    });

    if (!movement) {
      throw new Error("El movimiento no existe.");
    }

    const amount = validatePaymentAmount({
      movement,
      existingPayments: movement.payments,
      amount: amountText
    });
    const nextPayments = [...movement.payments, { amount }];
    const nextStatus = statusFromPayments(movement.amount, nextPayments);
    const nextRealDate = nextRealDateAfterPayment({
      currentRealDate: movement.realDate,
      nextStatus,
      paidAt
    });

    const payment = await tx.payment.create({
      data: {
        movementId: movement.id,
        bankAccountId: movement.bankAccountId,
        amount,
        currency: "CLP",
        paidAt,
        reference
      }
    });
    const updatedMovement = await tx.movement.update({
      where: { id: movement.id },
      data: {
        status: nextStatus,
        realDate: nextRealDate
      }
    });

    await tx.auditLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        entity: "Payment",
        entityId: payment.id,
        action: "CREATE",
        after: JSON.parse(JSON.stringify(payment)),
        metadata: {
          movementId: movement.id,
          pendingBefore: pendingBalance(movement.amount, movement.payments).toString(),
          movementStatusAfter: updatedMovement.status
        }
      }
    });
  });

  revalidatePath("/app/movimientos");
}

export async function cancelPaymentAction(formData: FormData) {
  const user = await requireMovementWriter();
  const paymentId = stringValue(formData, "paymentId");
  const cancelReason = optionalStringValue(formData, "cancelReason");

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: {
        id: paymentId,
        movement: { companyId: user.companyId }
      },
      include: {
        movement: {
          include: { payments: true }
        }
      }
    });

    if (!payment || payment.deletedAt || payment.cancelledAt) {
      throw new Error("El pago no existe o ya esta anulado.");
    }

    const cancelled = await tx.payment.update({
      where: { id: payment.id },
      data: {
        cancelledAt: new Date(),
        cancelReason
      }
    });
    const nextPayments = payment.movement.payments.map((item) => (item.id === cancelled.id ? cancelled : item));
    const nextStatus = statusFromPayments(payment.movement.amount, nextPayments);
    const updatedMovement = await tx.movement.update({
      where: { id: payment.movementId },
      data: {
        status: nextStatus,
        realDate: nextStatus === "PAID_OR_COLLECTED" ? payment.movement.realDate : null
      }
    });

    await tx.auditLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        entity: "Payment",
        entityId: payment.id,
        action: "CANCEL",
        before: JSON.parse(JSON.stringify(payment)),
        after: JSON.parse(JSON.stringify(cancelled)),
        metadata: {
          movementId: payment.movementId,
          movementStatusAfter: updatedMovement.status
        }
      }
    });
  });

  revalidatePath("/app/movimientos");
}

export async function getMovementDefaults(companyId: string) {
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
