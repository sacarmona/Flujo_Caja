import { Prisma } from "@prisma/client";
import type { Currency, MovementStatus, MovementType, RecurrenceFrequency, Role } from "@prisma/client";
import { generateRecurrenceOccurrences, type RecurrenceOccurrence } from "./recurrences";
import { movementCurrencies, movementStatuses, movementTypes, parseOptionalDate, parsePositiveDecimal, parseRequiredDate } from "./movements";

export const recurrenceFrequencies = [
  "DAILY",
  "BUSINESS_DAYS",
  "EVERY_N_DAYS",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "ANNUAL"
] as const satisfies RecurrenceFrequency[];

/** Frecuencias cuyo dia de ocurrencia lo fija "Dia del mes" (ver generateRecurrenceOccurrences). */
export const monthlyDayFrequencies = ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"] as const satisfies RecurrenceFrequency[];

/** Frecuencias cuyo dia de ocurrencia lo fija "Dia de la semana". */
export const weeklyDayFrequencies = ["WEEKLY", "BIWEEKLY"] as const satisfies RecurrenceFrequency[];

export type RecurrenceFormInput = {
  type: MovementType;
  accountingAccountId: string;
  description: string;
  amount: string;
  currency: Currency;
  bankAccountId: string;
  businessUnitId: string;
  projectId: string | null;
  costCenterId: string | null;
  frequency: RecurrenceFrequency;
  intervalDays: string | null;
  dayOfMonth: string | null;
  dayOfWeek: string | null;
  startDate: string;
  endDate: string | null;
  status: MovementStatus;
  notes: string | null;
};

export type RecurrenceReference = {
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

function optionalInteger(value: string | null, label: string, min: number, max: number): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} invalido.`);
  }

  return parsed;
}

export function canManageRecurrences(role: Role): boolean {
  return role === "ADMIN" || role === "FINANCE";
}

export function assertCanManageRecurrences(role: Role): void {
  if (!canManageRecurrences(role)) {
    throw new Error("Solo ADMIN y FINANCE pueden administrar recurrencias.");
  }
}

export function validateRecurrenceInput(input: RecurrenceFormInput, refs: RecurrenceReference) {
  if (!movementTypes.includes(input.type)) {
    throw new Error("Tipo de movimiento invalido.");
  }

  if (!movementCurrencies.includes(input.currency)) {
    throw new Error("Moneda invalida.");
  }

  if (!recurrenceFrequencies.includes(input.frequency)) {
    throw new Error("Frecuencia invalida.");
  }

  if (!movementStatuses.includes(input.status)) {
    throw new Error("Estado inicial invalido.");
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

  const startDate = parseRequiredDate(input.startDate);
  const endDate = parseOptionalDate(input.endDate);

  if (endDate && endDate < startDate) {
    throw new Error("La fecha de termino no puede ser anterior al inicio.");
  }

  const intervalDays = optionalInteger(input.intervalDays, "Intervalo", 1, 366);
  if (input.frequency === "EVERY_N_DAYS" && !intervalDays) {
    throw new Error("Cada N dias requiere intervalo.");
  }

  const dayOfMonth = optionalInteger(input.dayOfMonth, "Dia del mes", 1, 31);
  if ((monthlyDayFrequencies as readonly RecurrenceFrequency[]).includes(input.frequency) && dayOfMonth === null) {
    throw new Error("Dia del mes es obligatorio para esta frecuencia.");
  }

  const dayOfWeek = optionalInteger(input.dayOfWeek, "Dia de la semana", 0, 6);
  if ((weeklyDayFrequencies as readonly RecurrenceFrequency[]).includes(input.frequency) && dayOfWeek === null) {
    throw new Error("Dia de la semana es obligatoria para esta frecuencia.");
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
    frequency: input.frequency,
    intervalDays,
    dayOfMonth,
    dayOfWeek,
    startDate,
    endDate,
    status: input.status,
    notes: input.notes?.trim() || null
  };
}

export function previewRecurrence(
  recurrence: {
    frequency: RecurrenceFrequency;
    intervalDays: number | null;
    dayOfMonth?: number | null;
    dayOfWeek?: number | null;
    startDate: Date;
    endDate: Date | null;
  },
  holidays: string[] = [],
  take = 10
): RecurrenceOccurrence[] {
  return generateRecurrenceOccurrences(
    {
      frequency: recurrence.frequency,
      intervalDays: recurrence.intervalDays,
      dayOfMonth: recurrence.dayOfMonth,
      dayOfWeek: recurrence.dayOfWeek,
      startDate: recurrence.startDate,
      endDate: recurrence.endDate
    },
    { holidays, months: 12 }
  ).slice(0, take);
}

export function generatedMovementLink(ruleId: string) {
  const params = new URLSearchParams({ recurrenceRuleId: ruleId });
  return `/app/movimientos?${params.toString()}`;
}

export function recurrenceAmountToString(amount: Prisma.Decimal | number | string) {
  return amount instanceof Prisma.Decimal ? amount.toString() : String(amount);
}
