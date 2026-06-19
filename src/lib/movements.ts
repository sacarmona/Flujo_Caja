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
};

export function canModifyMovements(role: Role): boolean {
  return role === "ADMIN" || role === "FINANCE" || role === "MOVEMENT_ENTRY";
}

export function assertCanModifyMovements(role: Role): void {
  if (!canModifyMovements(role)) {
    throw new Error("READ_ONLY no puede modificar movimientos.");
  }
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

  const date = new Date(`${value}T00:00:00.000`);

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
    projectedDate: parseRequiredDate(input.projectedDate),
    realDate: parseOptionalDate(input.realDate),
    status: input.status,
    notes: input.notes?.trim() || null
  };
}
