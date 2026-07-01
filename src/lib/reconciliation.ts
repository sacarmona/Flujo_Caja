import { Prisma } from "@prisma/client";
import type { BankMovementType, MovementType, ReconciliationMatchLevel, Role } from "@prisma/client";

export function canManageReconciliation(role: Role): boolean {
  return role === "ADMIN" || role === "FINANCE";
}

export function assertCanManageReconciliation(role: Role): void {
  if (!canManageReconciliation(role)) {
    throw new Error("Solo ADMIN y FINANCE pueden conciliar movimientos bancarios.");
  }
}

export function movementTypeForBankType(bankType: BankMovementType): MovementType {
  return bankType === "ABONO" ? "INCOME" : "EXPENSE";
}

export type ReconciliationCandidate = {
  movementId: string;
  description: string;
  projectedDate: Date;
  type: MovementType;
  pending: Prisma.Decimal;
};

export type BankRowMatch = {
  matchLevel: ReconciliationMatchLevel;
  movementId: string | null;
  candidates: ReconciliationCandidate[];
};

export type SplitAllocation = {
  movementId: string;
  amount: Prisma.Decimal;
};

/**
 * Valida la distribucion de una fila de cartola entre varios movimientos
 * (ej. un cliente paga varias facturas en una sola transferencia): exige al
 * menos 2 movimientos distintos, montos positivos, y que la suma calce
 * EXACTO con el monto de la fila (sin remanente, version inicial de esta
 * funcionalidad). No valida aqui el tipo de cada movimiento ni que el monto
 * quepa en su saldo pendiente -eso lo hace el llamador con datos frescos de
 * la base de datos (ver splitReconciliationAction), evitando duplicar logica
 * con un candidate list que podria quedar desactualizado entre el render y
 * el envio del formulario.
 */
export function validateSplitAllocations(
  bankRow: { amount: Prisma.Decimal; type: BankMovementType },
  allocations: SplitAllocation[]
): void {
  if (allocations.length < 2) {
    throw new Error("Selecciona al menos 2 movimientos para distribuir esta fila.");
  }

  const uniqueMovementIds = new Set(allocations.map((allocation) => allocation.movementId));
  if (uniqueMovementIds.size !== allocations.length) {
    throw new Error("No puedes seleccionar el mismo movimiento mas de una vez.");
  }

  for (const allocation of allocations) {
    if (!allocation.amount.isFinite() || allocation.amount.lte(0)) {
      throw new Error("Cada monto asignado debe ser positivo.");
    }
  }

  const total = allocations.reduce((sum, allocation) => sum.plus(allocation.amount), new Prisma.Decimal(0));
  const bankAmount = bankRow.amount.abs();
  /**
   * Los montos individuales conservan los decimales de la conversion de
   * moneda (ver clpAmount en exchange-rates.ts); el redondeo a entero (el
   * CLP no tiene decimales) se aplica una sola vez, sobre la suma final, en
   * vez de a cada movimiento por separado, para no acumular error de
   * redondeo contra el monto entero de la cartola bancaria.
   */
  if (!total.toDecimalPlaces(0).eq(bankAmount)) {
    throw new Error(`La suma asignada (${total.toString()}) debe ser exactamente igual al monto de la fila bancaria (${bankAmount.toString()}).`);
  }
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * HIGH solo cuando el saldo pendiente de un unico movimiento coincide
 * exactamente con el monto del banco Y su fecha proyectada coincide con la
 * fecha del banco (tolerancia cero, segun lo definido para esta primera
 * version): es el unico caso en que se puede confirmar de un clic sin
 * revisar manualmente. Cualquier otra coincidencia por monto (sin fecha
 * exacta, o con mas de un candidato) queda como POSSIBLE para que el
 * usuario elija o descarte.
 */
export function matchBankRow(
  row: { amount: Prisma.Decimal; type: BankMovementType; date: Date },
  candidates: ReconciliationCandidate[]
): BankRowMatch {
  const expectedType = movementTypeForBankType(row.type);
  const absAmount = row.amount.abs();
  const sameAmount = candidates.filter((candidate) => candidate.type === expectedType && candidate.pending.eq(absAmount));

  if (sameAmount.length === 0) {
    return { matchLevel: "NONE", movementId: null, candidates: [] };
  }

  const exactDate = sameAmount.filter((candidate) => isSameDay(candidate.projectedDate, row.date));
  if (exactDate.length === 1) {
    return { matchLevel: "HIGH", movementId: exactDate[0].movementId, candidates: exactDate };
  }

  return {
    matchLevel: "POSSIBLE",
    movementId: sameAmount.length === 1 ? sameAmount[0].movementId : null,
    candidates: sameAmount
  };
}

export type ConfirmedBankRow = {
  date: Date;
  amount: Prisma.Decimal;
  type: BankMovementType;
  reference: string | null;
};

/**
 * Detecta si una fila de la cartola corresponde a un movimiento bancario que
 * ya quedo conciliado (confirmado) en una importacion anterior, para no
 * volver a mostrarlo como "nuevo" cuando la cartola se reenvia o se
 * actualiza con un rango de fechas que se superpone con una subida previa.
 * Se compara por fecha + monto + tipo (igual que el nivel HIGH de
 * matchBankRow); si ambas filas tienen referencia del banco, tambien debe
 * coincidir, para reducir falsos positivos cuando hay dos movimientos
 * distintos del mismo monto el mismo dia.
 */
function matchesConfirmedRow(
  row: { date: Date; amount: Prisma.Decimal; type: BankMovementType; reference: string | null },
  confirmed: ConfirmedBankRow
): boolean {
  if (!isSameDay(confirmed.date, row.date) || confirmed.type !== row.type || !confirmed.amount.abs().eq(row.amount.abs())) {
    return false;
  }
  if (confirmed.reference && row.reference) {
    return confirmed.reference === row.reference;
  }
  return true;
}

export function isAlreadyReconciled(
  row: { date: Date; amount: Prisma.Decimal; type: BankMovementType; reference: string | null },
  confirmedRows: ConfirmedBankRow[]
): boolean {
  return confirmedRows.some((confirmed) => matchesConfirmedRow(row, confirmed));
}

/**
 * Igual que isAlreadyReconciled, pero separando todas las filas de una sola
 * pasada y "consumiendo" cada fila confirmada al usarla: evita que dos
 * movimientos nuevos con la misma fecha+monto+tipo (algo comun, ya que el
 * banco a veces no informa un N° de documento util y todas las filas
 * comparten el mismo valor generico) se marquen ambos como ya conciliados
 * solo porque uno de ellos en el pasado si lo estaba.
 */
export function partitionAlreadyReconciled<
  T extends { date: Date; amount: Prisma.Decimal; type: BankMovementType; reference: string | null }
>(rows: T[], confirmedRows: ConfirmedBankRow[]): { newRows: T[]; alreadyReconciledCount: number } {
  const remaining = [...confirmedRows];
  const newRows: T[] = [];

  for (const row of rows) {
    const matchIndex = remaining.findIndex((confirmed) => matchesConfirmedRow(row, confirmed));
    if (matchIndex >= 0) {
      remaining.splice(matchIndex, 1);
    } else {
      newRows.push(row);
    }
  }

  return { newRows, alreadyReconciledCount: rows.length - newRows.length };
}
