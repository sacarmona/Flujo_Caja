import { Prisma } from "@prisma/client";
import type { MovementStatus, Role } from "@prisma/client";

export function canManageVendors(role: Role): boolean {
  return role === "ADMIN" || role === "FINANCE";
}

export function assertCanManageVendors(role: Role): void {
  if (!canManageVendors(role)) {
    throw new Error("Solo ADMIN y FINANCE pueden administrar proveedores.");
  }
}

/** El valor llega ya normalizado (decimal con ".") desde AmountInput, igual que en Movimientos. */
export function parseVendorAmount(value: string, fieldLabel: string): Prisma.Decimal {
  if (!value.trim()) {
    throw new Error(`${fieldLabel} es obligatorio.`);
  }

  const amount = new Prisma.Decimal(value.replace(",", "."));

  if (!amount.isFinite()) {
    throw new Error(`${fieldLabel} debe ser un numero valido.`);
  }

  return amount;
}

export function parseOptionalVendorAmount(value: string): Prisma.Decimal | null {
  if (!value.trim()) {
    return null;
  }
  return parseVendorAmount(value, "La cuota de referencia");
}

export function parseDueDay(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const day = Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error("El dia de vencimiento debe ser un numero entre 1 y 31.");
  }

  return day;
}

export type VendorFormInput = {
  category: string;
  name: string;
  referenceInstallment: string;
  dueDay: string;
  initialDebtClp: string;
  notes: string | null;
};

export function validateVendorInput(input: VendorFormInput) {
  const category = input.category.trim();
  if (!category) {
    throw new Error("La categoria es obligatoria.");
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre del proveedor es obligatorio.");
  }

  return {
    category,
    name,
    referenceInstallment: parseOptionalVendorAmount(input.referenceInstallment),
    dueDay: parseDueDay(input.dueDay),
    initialDebtClp: parseVendorAmount(input.initialDebtClp, "El monto total adeudado"),
    notes: input.notes?.trim() || null
  };
}

/** Estados que cuentan como "Real": mismo criterio que realEligibleStatuses en cash-flow.ts. */
const realEligibleStatuses: MovementStatus[] = ["PARTIALLY_PAID", "PAID_OR_COLLECTED"];

/**
 * Suma lo efectivamente pagado a traves de los movimientos vinculados a un
 * proveedor, replicando exactamente el mismo criterio que el motor de flujo
 * de caja usa para Modo Real (ver addEntry/realEligibleStatuses en
 * cash-flow.ts): si el movimiento tiene pagos activos registrados, se suman
 * esos montos; si no tiene ninguno pero su estado ya es Parcial o
 * Pagado/Cobrado (por ejemplo, marcado asi manualmente sin pasar por
 * Conciliacion todavia), se usa projectedAmountClp como respaldo. Sin este
 * respaldo, un movimiento recien marcado Pagado/Cobrado sin un Payment
 * asociado aun no descontaria nada de la deuda, inconsistente con como se
 * ve ese mismo movimiento en Calendario/Movimientos.
 */
export function vendorPaidAmount(
  movements: Array<{
    status: MovementStatus;
    projectedAmountClp: Prisma.Decimal;
    payments: Array<{ amount: Prisma.Decimal }>;
  }>
): Prisma.Decimal {
  return movements.reduce((total, movement) => {
    if (movement.payments.length > 0) {
      return movement.payments.reduce((sum, payment) => sum.plus(payment.amount), total);
    }
    if (realEligibleStatuses.includes(movement.status)) {
      return total.plus(movement.projectedAmountClp);
    }
    return total;
  }, new Prisma.Decimal(0));
}

/**
 * Saldo pendiente de un proveedor: Total inicial menos lo efectivamente
 * pagado (vendorPaidAmount). No se persiste como columna para que nunca
 * quede desincronizado de los pagos reales.
 */
export function vendorRemainingDebt(initialDebtClp: Prisma.Decimal, paidClp: Prisma.Decimal): Prisma.Decimal {
  return initialDebtClp.minus(paidClp);
}

export function isVendorSettled(remainingDebt: Prisma.Decimal): boolean {
  return remainingDebt.lte(0);
}

export function isVendorOverpaid(remainingDebt: Prisma.Decimal): boolean {
  return remainingDebt.lt(0);
}
