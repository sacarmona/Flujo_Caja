import { Prisma } from "@prisma/client";
import type { Currency, MovementStatus, Role } from "@prisma/client";
import { assertCanModifyMovements } from "./movements";

export type PaymentLike = {
  amount: Prisma.Decimal | number | string;
  deletedAt?: Date | null;
  cancelledAt?: Date | null;
};

export type PayableMovement = {
  amount: Prisma.Decimal | number | string;
  currency: Currency;
  status: MovementStatus;
  cancelledAt?: Date | null;
  deletedAt?: Date | null;
};

export function decimal(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function activePayments(payments: PaymentLike[]): PaymentLike[] {
  return payments.filter((payment) => !payment.deletedAt && !payment.cancelledAt);
}

export function totalPaid(payments: PaymentLike[]): Prisma.Decimal {
  return activePayments(payments).reduce((sum, payment) => sum.plus(decimal(payment.amount)), new Prisma.Decimal(0));
}

export function pendingBalance(movementAmount: Prisma.Decimal | number | string, payments: PaymentLike[]): Prisma.Decimal {
  const pending = decimal(movementAmount).minus(totalPaid(payments));
  return pending.isNegative() ? new Prisma.Decimal(0) : pending;
}

export function statusFromPayments(movementAmount: Prisma.Decimal | number | string, payments: PaymentLike[]): MovementStatus {
  const paid = totalPaid(payments);

  if (paid.eq(0)) {
    return "PENDING";
  }

  if (paid.gte(decimal(movementAmount))) {
    return "PAID_OR_COLLECTED";
  }

  return "PARTIALLY_PAID";
}

export function assertCanRegisterPayment(role: Role): void {
  assertCanModifyMovements(role);
}

export function validatePaymentAmount(params: {
  movement: PayableMovement;
  existingPayments: PaymentLike[];
  amount: string;
}): Prisma.Decimal {
  if (params.movement.currency !== "CLP") {
    throw new Error("Por ahora solo se registran pagos en CLP.");
  }

  if (params.movement.status === "CANCELLED" || params.movement.cancelledAt || params.movement.deletedAt) {
    throw new Error("No se pueden registrar pagos en movimientos cancelados.");
  }

  const amount = decimal(params.amount.replace(",", "."));

  if (!amount.isFinite() || amount.lte(0)) {
    throw new Error("El monto del pago debe ser positivo.");
  }

  const pending = pendingBalance(params.movement.amount, params.existingPayments);

  if (amount.gt(pending)) {
    throw new Error("El pago no puede superar el saldo pendiente.");
  }

  return amount;
}

export function nextRealDateAfterPayment(params: {
  currentRealDate: Date | null;
  nextStatus: MovementStatus;
  paidAt: Date;
}): Date | null {
  if (params.nextStatus === "PAID_OR_COLLECTED") {
    return params.currentRealDate ?? params.paidAt;
  }

  return params.currentRealDate;
}
