import { Prisma } from "@prisma/client";
import type { MovementStatus, MovementType } from "@prisma/client";
import { formatAmountNumber, formatCurrency, todayInAppTimeZone } from "@/lib/format";
import { weekOfYear } from "@/lib/iso-week";

export const typeLabels: Record<MovementType, string> = {
  INCOME: "Ingreso",
  EXPENSE: "Egreso"
};

export const statusLabels: Record<MovementStatus, string> = {
  PROJECTED: "Proyectado",
  PENDING: "Pendiente",
  PARTIALLY_PAID: "Parcial",
  PAID_OR_COLLECTED: "Pagado/Cobrado",
  OVERDUE: "Vencido",
  CANCELLED: "Cancelado"
};

export const movementInclude = {
  accountingAccount: true,
  bankAccount: true,
  businessUnit: true,
  costCenter: true,
  payments: {
    include: { bankAccount: true },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }]
  },
  project: true,
  _count: { select: { reconciliations: true } }
} satisfies Prisma.MovementInclude;

export type MovementWithRelations = Prisma.MovementGetPayload<{ include: typeof movementInclude }>;

/**
 * Solo strings/numeros/fechas planos: Movement viene de un Server Component
 * y sus campos Decimal (amount, projectedRate, projectedAmountClp,
 * payments[].amount) no son serializables hacia un Client Component
 * (MovementForm, QuickEditRow). projectedAmountClp se descarta directamente
 * (no se usa en ningun formulario), el resto se convierte a string.
 */
export type MovementFormValues = Omit<MovementWithRelations, "amount" | "projectedRate" | "projectedAmountClp" | "payments"> & {
  amount: string;
  projectedRate: string;
  payments: Array<Omit<MovementWithRelations["payments"][number], "amount"> & { amount: string }>;
};

export function serializeMovementForForm(movement: MovementWithRelations): MovementFormValues {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { projectedAmountClp, ...rest } = movement;
  return {
    ...rest,
    amount: movement.amount.toString(),
    projectedRate: movement.projectedRate.toString(),
    payments: movement.payments.map((payment) => ({ ...payment, amount: payment.amount.toString() }))
  };
}

export function optionLabel(code: string | null | undefined, name: string) {
  return code ? `${code} - ${name}` : name;
}

export function dateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function todayInputValue(): string {
  const now = todayInAppTimeZone();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatAmount(amount: { toString(): string } | number, currency: string) {
  return currency === "CLP" ? formatCurrency(Number(amount)) : `${formatAmountNumber(amount.toString())} ${currency}`;
}

/**
 * Agrupa una lista ya ordenada por fecha en bloques de semana ISO 8601
 * (lunes a domingo), etiquetando cada bloque con su numero real de semana
 * en vez de un contador secuencial de apariciones.
 */
export function groupByWeek<T>(items: T[], dateOf: (item: T) => Date): { key: string; label: string; items: T[] }[] {
  const groups: { key: string; label: string; items: T[] }[] = [];

  for (const item of items) {
    const { year, week } = weekOfYear(dateOf(item));
    const key = `${year}-${week}`;
    const last = groups.at(-1);
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, label: `Semana ${week}`, items: [item] });
    }
  }

  return groups;
}
