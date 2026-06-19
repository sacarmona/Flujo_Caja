import { Prisma } from "@prisma/client";
import type { MovementStatus, MovementType } from "@prisma/client";
import { formatCurrency } from "@/lib/format";

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
  project: true
} satisfies Prisma.MovementInclude;

export type MovementWithRelations = Prisma.MovementGetPayload<{ include: typeof movementInclude }>;

export function optionLabel(code: string | null | undefined, name: string) {
  return code ? `${code} - ${name}` : name;
}

export function dateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function formatAmount(amount: { toString(): string } | number, currency: string) {
  return currency === "CLP" ? formatCurrency(Number(amount)) : `${amount.toString()} ${currency}`;
}

function weekStartKey(date: Date): string {
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + diffToMonday);
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(monday.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

/**
 * Agrupa una lista ya ordenada por fecha en bloques de semana consecutivos,
 * etiquentandolos secuencialmente ("Semana 1", "Semana 2", ...) en el orden
 * en que aparecen, no por numero de semana calendario absoluto.
 */
export function groupByWeek<T>(items: T[], dateOf: (item: T) => Date): { label: string; items: T[] }[] {
  const groups: { key: string; items: T[] }[] = [];

  for (const item of items) {
    const key = weekStartKey(dateOf(item));
    const last = groups.at(-1);
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, items: [item] });
    }
  }

  return groups.map((group, index) => ({ label: `Semana ${index + 1}`, items: group.items }));
}
