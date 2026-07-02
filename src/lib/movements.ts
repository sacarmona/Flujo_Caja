import { Prisma } from "@prisma/client";
import type { AccountingAccountType, Currency, MovementStatus, MovementType, Role } from "@prisma/client";

export const movementTypes = ["INCOME", "EXPENSE"] as const satisfies MovementType[];
export const movementStatuses = [
  "PROJECTED",
  "PENDING",
  "PARTIALLY_PAID",
  "PAID_OR_COLLECTED",
  "OVERDUE",
  "CANCELLED"
] as const satisfies MovementStatus[];
export const movementCurrencies = ["CLP", "UF", "EUR", "USD"] as const satisfies Currency[];

/**
 * Cuentas con type "INCOME" solo aplican a movimientos/recurrencias tipo
 * INCOME; cualquier otro AccountingAccountType (DIRECT_COST, ADMIN_EXPENSE,
 * TAX, FINANCING, INVESTMENT, NON_OPERATIONAL) aplica a EXPENSE.
 */
export function accountMatchesMovementType(accountType: AccountingAccountType, movementType: MovementType): boolean {
  return movementType === "INCOME" ? accountType === "INCOME" : accountType !== "INCOME";
}

export type MovementFormInput = {
  type: MovementType;
  accountingAccountId: string;
  description: string;
  amount: string;
  currency: Currency;
  manualRate: string | null;
  manualRateReason: string | null;
  bankAccountId: string;
  businessUnitId: string;
  projectId: string | null;
  costCenterId: string | null;
  vendorId: string | null;
  projectedDate: string;
  realDate: string | null;
  status: MovementStatus;
  notes: string | null;
};

export type MovementReference = {
  accountingAccount?: {
    id: string;
    isActive: boolean;
    allowMovements: boolean;
    deletedAt: Date | null;
    _count?: { children: number };
  } | null;
  bankAccount?: { id: string; isActive: boolean; deletedAt: Date | null } | null;
  businessUnit?: { id: string; isActive: boolean; deletedAt: Date | null } | null;
  project?: { id: string; businessUnitId: string; isActive: boolean; deletedAt: Date | null } | null;
  costCenter?: { id: string; isActive: boolean; deletedAt: Date | null } | null;
  vendor?: { id: string; isActive: boolean; deletedAt: Date | null } | null;
};

/** Estados que cuentan como "Atrasado": aun no se cobra/paga (ni siquiera parcial) y su fecha proyectada ya paso. */
const lateEligibleStatuses: MovementStatus[] = ["PROJECTED", "PENDING"];

export function isLateMovement(movement: { status: MovementStatus; projectedDate: Date }, today: Date): boolean {
  return lateEligibleStatuses.includes(movement.status) && movement.projectedDate < today;
}

export function canModifyMovements(role: Role): boolean {
  return role === "ADMIN" || role === "FINANCE" || role === "MOVEMENT_ENTRY";
}

export function assertCanModifyMovements(role: Role): void {
  if (!canModifyMovements(role)) {
    throw new Error("READ_ONLY no puede modificar movimientos.");
  }
}

export function assertPaidMovementFinancialFieldsUnchanged(
  movement: {
    status: MovementStatus;
    amount: Prisma.Decimal | string | number;
    projectedDate: Date;
    realDate: Date | null;
  },
  input: Pick<MovementFormInput, "amount" | "projectedDate" | "realDate">
): void {
  if (movement.status !== "PAID_OR_COLLECTED") return;

  const amountChanged = !new Prisma.Decimal(movement.amount).eq(parsePositiveDecimal(input.amount));
  const projectedDateChanged = parseRequiredDate(input.projectedDate).getTime() !== movement.projectedDate.getTime();
  const inputRealDate = parseOptionalDate(input.realDate);
  const realDateChanged = inputRealDate?.getTime() !== movement.realDate?.getTime();

  if (amountChanged || projectedDateChanged || realDateChanged) {
    throw new Error("No se puede modificar el monto ni las fechas de un movimiento pagado o cobrado.");
  }
}

export function canCancelAndDeleteMovement(movement: {
  status: MovementStatus;
  deletedAt?: Date | null;
  cancelledAt?: Date | null;
  payments?: Array<{ deletedAt?: Date | null; cancelledAt?: Date | null }>;
  _count?: { reconciliations?: number };
}): boolean {
  const activePayments = movement.payments?.filter((payment) => !payment.deletedAt && !payment.cancelledAt).length ?? 0;
  const reconciliations = movement._count?.reconciliations ?? 0;

  return (
    !movement.deletedAt &&
    !movement.cancelledAt &&
    !["PARTIALLY_PAID", "PAID_OR_COLLECTED"].includes(movement.status) &&
    activePayments === 0 &&
    reconciliations === 0
  );
}

export function parsePositiveDecimal(value: string): Prisma.Decimal {
  const decimal = new Prisma.Decimal(value.replace(",", "."));

  if (!decimal.isFinite() || decimal.lte(0)) {
    throw new Error("El monto bruto debe ser positivo.");
  }

  return decimal;
}

export function parseOptionalDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Fecha invalida.");
  }

  return date;
}

export function parseRequiredDate(value: string): Date {
  const date = parseOptionalDate(value);

  if (!date) {
    throw new Error("La fecha proyectada es obligatoria.");
  }

  return date;
}

export function validateMovementInput(input: MovementFormInput, refs: MovementReference) {
  if (!movementTypes.includes(input.type)) {
    throw new Error("Tipo de movimiento invalido.");
  }

  if (!movementStatuses.includes(input.status)) {
    throw new Error("Estado de movimiento invalido.");
  }

  if (!movementCurrencies.includes(input.currency)) {
    throw new Error("Moneda invalida.");
  }

  if (!input.description.trim()) {
    throw new Error("La descripcion es obligatoria.");
  }

  const account = refs.accountingAccount;
  if (!account || !account.isActive || account.deletedAt || !account.allowMovements || (account._count?.children ?? 0) > 0) {
    throw new Error("La cuenta contable no permite movimientos.");
  }

  const bankAccount = refs.bankAccount;
  if (!bankAccount || !bankAccount.isActive || bankAccount.deletedAt) {
    throw new Error("La cuenta bancaria no esta activa.");
  }

  const businessUnit = refs.businessUnit;
  if (!businessUnit || !businessUnit.isActive || businessUnit.deletedAt) {
    throw new Error("La unidad de negocio es obligatoria y debe estar activa.");
  }

  if (input.projectId) {
    const project = refs.project;
    if (!project || !project.isActive || project.deletedAt || project.businessUnitId !== input.businessUnitId) {
      throw new Error("El proyecto no es valido para la unidad de negocio seleccionada.");
    }
  }

  if (input.costCenterId) {
    const costCenter = refs.costCenter;
    if (!costCenter || !costCenter.isActive || costCenter.deletedAt) {
      throw new Error("El centro de costo no esta activo.");
    }
  }

  if (input.vendorId && input.type !== "EXPENSE") {
    throw new Error("El proveedor solo aplica a movimientos de Egreso.");
  }

  if (input.vendorId) {
    const vendor = refs.vendor;
    if (!vendor || vendor.deletedAt) {
      throw new Error("El proveedor seleccionado no existe.");
    }
  }

  return {
    type: input.type,
    accountingAccountId: input.accountingAccountId,
    description: input.description.trim(),
    amount: parsePositiveDecimal(input.amount),
    currency: input.currency,
    bankAccountId: input.bankAccountId,
    businessUnitId: input.businessUnitId,
    projectId: input.projectId,
    costCenterId: input.costCenterId,
    vendorId: input.vendorId,
    projectedDate: parseRequiredDate(input.projectedDate),
    realDate: parseOptionalDate(input.realDate),
    status: input.status,
    notes: input.notes?.trim() || null
  };
}
