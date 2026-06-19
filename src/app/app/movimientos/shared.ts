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

export function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatAmount(amount: { toString(): string } | number, currency: string) {
  return currency === "CLP" ? formatCurrency(Number(amount)) : `${amount.toString()} ${currency}`;
}

/**
 * Numero de semana del año en bloques fijos de 7 dias desde el 1 de enero
 * (Semana 1 = 01-01 al 07-01, Semana 2 = 08-01 al 14-01, ...), no semanas
 * ISO alineadas a lunes. Se usa UTC solo para la aritmetica de dias (evita
 * desfases por horario de verano), tomando los componentes de fecha local.
 */
function weekOfYear(date: Date): { year: number; week: number } {
  const year = date.getFullYear();
  const utcDate = Date.UTC(year, date.getMonth(), date.getDate());
  const utcStart = Date.UTC(year, 0, 1);
  const dayOfYear = Math.round((utcDate - utcStart) / 86400000) + 1;
  return { year, week: Math.min(Math.ceil(dayOfYear / 7), 52) };
}

/**
 * Agrupa una lista ya ordenada por fecha en bloques de semana del año
 * calendario (Semana 1 a Semana 52), etiquetando cada bloque con su numero
 * real de semana en vez de un contador secuencial de apariciones.
 */
export function groupByWeek<T>(items: T[], dateOf: (item: T) => Date): { label: string; items: T[] }[] {
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
