"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { MovementType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { parseBankStatementFile, type BankStatementRawRow } from "@/lib/bank-statement-import";
import { todayInAppTimeZone } from "@/lib/format";
import { weekKeyOf } from "@/lib/iso-week";
import { parseRequiredDate, validateMovementInput, type MovementFormInput } from "@/lib/movements";
import { nextRealDateAfterPayment, pendingBalance, statusFromPayments, validatePaymentAmount } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import {
  assertCanManageReconciliation,
  matchBankRow,
  movementTypeForBankType,
  partitionAlreadyReconciled,
  type ConfirmedBankRow,
  type ReconciliationCandidate
} from "@/lib/reconciliation";
import { redirectSaved, redirectWithError } from "@/lib/saved-redirect";

function stringValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalStringValue(formData: FormData, key: string): string | null {
  const value = stringValue(formData, key);
  return value ? value : null;
}

async function requireReconciliationManager() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Debes iniciar sesion.");
  }
  assertCanManageReconciliation(user.role);
  return user;
}

/**
 * Ventana de candidatos: el banco puede liquidar un movimiento proyectado
 * varios dias antes o despues de su fecha original, asi que se buscan
 * movimientos pendientes dentro de un rango amplio alrededor de las fechas
 * de la cartola importada, en vez de limitarse al dia exacto.
 */
const CANDIDATE_WINDOW_DAYS = 21;

export async function loadCandidates(companyId: string, bankAccountId: string, fromDate: Date, toDate: Date): Promise<ReconciliationCandidate[]> {
  const windowMs = CANDIDATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const movements = await prisma.movement.findMany({
    where: {
      companyId,
      bankAccountId,
      deletedAt: null,
      cancelledAt: null,
      status: { in: ["PROJECTED", "PENDING", "PARTIALLY_PAID", "OVERDUE"] },
      projectedDate: { gte: new Date(fromDate.getTime() - windowMs), lte: new Date(toDate.getTime() + windowMs) }
    },
    include: { payments: true }
  });

  return movements.map((movement) => ({
    movementId: movement.id,
    description: movement.description,
    projectedDate: movement.projectedDate,
    type: movement.type,
    pending: pendingBalance(movement.amount, movement.payments)
  }));
}

async function loadConfirmedBankRows(companyId: string, bankAccountId: string, rows: BankStatementRawRow[]): Promise<ConfirmedBankRow[]> {
  if (rows.length === 0) return [];
  const dates = rows.map((row) => row.date.getTime());

  return prisma.bankMovement.findMany({
    where: {
      bankAccountId,
      batch: { companyId },
      date: { gte: new Date(Math.min(...dates)), lte: new Date(Math.max(...dates)) },
      reconciliation: { confirmed: true }
    },
    select: { date: true, amount: true, type: true, reference: true }
  });
}

export async function uploadBankStatementAction(formData: FormData) {
  const user = await requireReconciliationManager();
  const bankAccountId = stringValue(formData, "bankAccountId");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return redirectWithError("/app/conciliacion", "Selecciona un archivo de cartola (XLSX) para importar.");
  }

  const bankAccount = await prisma.bankAccount.findFirst({ where: { id: bankAccountId, companyId: user.companyId } });
  if (!bankAccount) {
    return redirectWithError("/app/conciliacion", "La cuenta bancaria no existe.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsedRows = await parseBankStatementFile(buffer);

  if (parsedRows.length === 0) {
    return redirectWithError("/app/conciliacion", "La planilla no tiene movimientos para importar.");
  }

  /**
   * Solo se concilia la semana en curso: si el saldo inicial de la semana
   * ya quedo actualizado, los movimientos de semanas anteriores no
   * necesitan revisarse de nuevo aunque vengan incluidos en la cartola
   * (que suele traer varios dias o semanas previas).
   */
  const currentWeekKey = weekKeyOf(todayInAppTimeZone());
  const currentWeekRows = parsedRows.filter((row) => weekKeyOf(row.date) === currentWeekKey);
  const skippedOldWeeks = parsedRows.length - currentWeekRows.length;

  if (currentWeekRows.length === 0) {
    return redirectWithError("/app/conciliacion", "La cartola no tiene movimientos de la semana en curso (todos son de semanas anteriores).");
  }

  const confirmedRows = await loadConfirmedBankRows(user.companyId, bankAccountId, currentWeekRows);
  const { newRows: rawRows, alreadyReconciledCount: skippedAlreadyReconciled } = partitionAlreadyReconciled(currentWeekRows, confirmedRows);

  if (rawRows.length === 0) {
    return redirectWithError(
      "/app/conciliacion",
      "Todos los movimientos de la semana en curso de esta cartola ya fueron conciliados en una importacion anterior."
    );
  }

  const skipNotes = [
    skippedOldWeeks > 0 ? `${skippedOldWeeks} de semanas anteriores` : null,
    skippedAlreadyReconciled > 0 ? `${skippedAlreadyReconciled} ya conciliados` : null
  ].filter((note): note is string => note !== null);

  const dates = rawRows.map((row) => row.date.getTime());
  const candidates = await loadCandidates(user.companyId, bankAccountId, new Date(Math.min(...dates)), new Date(Math.max(...dates)));

  await prisma.$transaction(async (tx) => {
    const batch = await tx.bankImportBatch.create({
      data: {
        companyId: user.companyId,
        bankAccountId,
        fileName: skipNotes.length > 0 ? `${file.name} (se omitieron ${skipNotes.join(", ")})` : file.name,
        status: "MAPPED",
        uploadedById: user.id
      }
    });

    for (const raw of rawRows) {
      await tx.bankImportRow.create({
        data: {
          batchId: batch.id,
          rowNumber: raw.rowNumber,
          rawData: JSON.parse(
            JSON.stringify({
              fecha: raw.date,
              monto: raw.amount.toString(),
              tipo: raw.type,
              descripcion: raw.description,
              referencia: raw.reference,
              sucursal: raw.branch
            })
          )
        }
      });

      const bankMovement = await tx.bankMovement.create({
        data: {
          batchId: batch.id,
          bankAccountId,
          date: raw.date,
          amount: raw.amount,
          type: raw.type,
          description: raw.description,
          reference: raw.reference
        }
      });

      const match = matchBankRow(raw, candidates);
      await tx.reconciliation.create({
        data: {
          bankMovementId: bankMovement.id,
          movementId: match.movementId,
          matchLevel: match.matchLevel
        }
      });
    }
  });

  revalidatePath("/app/conciliacion");
  await redirectSaved("/app/conciliacion");
}

async function registerReconciliationPayment(params: {
  tx: Prisma.TransactionClient;
  userId: string;
  companyId: string;
  movementId: string;
  amount: Prisma.Decimal;
  paidAt: Date;
  reference: string;
}) {
  const movement = await params.tx.movement.findFirst({
    where: { id: params.movementId, companyId: params.companyId, deletedAt: null },
    include: { payments: true }
  });
  if (!movement) {
    throw new Error("El movimiento no existe.");
  }

  const amount = validatePaymentAmount({ movement, existingPayments: movement.payments, amount: params.amount.toString() });
  const nextPayments = [...movement.payments, { amount }];
  const nextStatus = statusFromPayments(movement.amount, nextPayments);
  const nextRealDate = nextRealDateAfterPayment({ currentRealDate: movement.realDate, nextStatus, paidAt: params.paidAt });

  const payment = await params.tx.payment.create({
    data: {
      movementId: movement.id,
      bankAccountId: movement.bankAccountId,
      amount,
      currency: "CLP",
      paidAt: params.paidAt,
      reference: params.reference
    }
  });
  await params.tx.movement.update({ where: { id: movement.id }, data: { status: nextStatus, realDate: nextRealDate } });
  await params.tx.auditLog.create({
    data: {
      companyId: params.companyId,
      userId: params.userId,
      entity: "Payment",
      entityId: payment.id,
      action: "CREATE",
      after: JSON.parse(JSON.stringify(payment)),
      metadata: { movementId: movement.id, source: "conciliacion" }
    }
  });

  return payment;
}

export async function confirmReconciliationAction(formData: FormData) {
  const user = await requireReconciliationManager();
  const reconciliationId = stringValue(formData, "reconciliationId");
  const selectedMovementId = optionalStringValue(formData, "movementId");

  await prisma.$transaction(async (tx) => {
    const reconciliation = await tx.reconciliation.findFirst({
      where: { id: reconciliationId, bankMovement: { bankAccount: { companyId: user.companyId } } },
      include: { bankMovement: true }
    });
    if (!reconciliation || reconciliation.confirmed || reconciliation.reversed) {
      throw new Error("La conciliacion no existe o ya fue procesada.");
    }

    const movementId = selectedMovementId ?? reconciliation.movementId;
    if (!movementId) {
      throw new Error("Selecciona el movimiento con el que se concilia esta fila del banco.");
    }

    const payment = await registerReconciliationPayment({
      tx,
      userId: user.id,
      companyId: user.companyId,
      movementId,
      amount: reconciliation.bankMovement.amount.abs(),
      paidAt: reconciliation.bankMovement.date,
      reference: `Conciliacion banco${reconciliation.bankMovement.reference ? ` - Doc. ${reconciliation.bankMovement.reference}` : ""}`
    });

    await tx.reconciliation.update({
      where: { id: reconciliation.id },
      data: { movementId, paymentId: payment.id, confirmed: true, confirmedById: user.id, confirmedAt: new Date() }
    });
  });

  revalidatePath("/app/conciliacion");
  revalidatePath("/app/movimientos");
  await redirectSaved("/app/conciliacion");
}

export async function createMovementFromBankRowAction(formData: FormData) {
  const user = await requireReconciliationManager();
  const reconciliationId = stringValue(formData, "reconciliationId");
  const accountingAccountId = stringValue(formData, "accountingAccountId");
  const businessUnitId = stringValue(formData, "businessUnitId");
  const projectId = optionalStringValue(formData, "projectId");
  const costCenterId = optionalStringValue(formData, "costCenterId");

  await prisma.$transaction(async (tx) => {
    const reconciliation = await tx.reconciliation.findFirst({
      where: { id: reconciliationId, bankMovement: { bankAccount: { companyId: user.companyId } } },
      include: { bankMovement: true }
    });
    if (!reconciliation || reconciliation.confirmed || reconciliation.reversed) {
      throw new Error("La conciliacion no existe o ya fue procesada.");
    }

    const bankMovement = reconciliation.bankMovement;
    const type: MovementType = movementTypeForBankType(bankMovement.type);
    const projectedDateText = bankMovement.date.toISOString().slice(0, 10);

    const input: MovementFormInput = {
      type,
      accountingAccountId,
      description: bankMovement.description || "Movimiento importado desde cartola bancaria",
      amount: bankMovement.amount.abs().toString(),
      currency: "CLP",
      manualRate: null,
      manualRateReason: null,
      bankAccountId: bankMovement.bankAccountId,
      businessUnitId,
      projectId,
      costCenterId,
      projectedDate: projectedDateText,
      realDate: projectedDateText,
      status: "PENDING",
      notes: "Creado desde Conciliacion bancaria."
    };

    const [accountingAccount, bankAccount, businessUnit, project, costCenter] = await Promise.all([
      tx.accountingAccount.findFirst({ where: { id: accountingAccountId, companyId: user.companyId }, include: { _count: { select: { children: true } } } }),
      tx.bankAccount.findFirst({ where: { id: bankMovement.bankAccountId, companyId: user.companyId } }),
      tx.businessUnit.findFirst({ where: { id: businessUnitId, companyId: user.companyId } }),
      projectId ? tx.project.findFirst({ where: { id: projectId, companyId: user.companyId } }) : Promise.resolve(null),
      costCenterId ? tx.costCenter.findFirst({ where: { id: costCenterId, companyId: user.companyId } }) : Promise.resolve(null)
    ]);

    const data = validateMovementInput(input, { accountingAccount, bankAccount, businessUnit, project, costCenter });
    const movement = await tx.movement.create({
      data: {
        companyId: user.companyId,
        ...data,
        currency: "CLP",
        conversionDate: parseRequiredDate(projectedDateText),
        projectedRate: new Prisma.Decimal(1),
        projectedAmountClp: data.amount,
        exchangeRateSource: "CLP",
        isManualRate: false
      }
    });

    await tx.auditLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        entity: "Movement",
        entityId: movement.id,
        action: "CREATE",
        after: JSON.parse(JSON.stringify(movement)),
        metadata: { source: "conciliacion" }
      }
    });

    const payment = await registerReconciliationPayment({
      tx,
      userId: user.id,
      companyId: user.companyId,
      movementId: movement.id,
      amount: bankMovement.amount.abs(),
      paidAt: bankMovement.date,
      reference: `Conciliacion banco${bankMovement.reference ? ` - Doc. ${bankMovement.reference}` : ""}`
    });

    await tx.reconciliation.update({
      where: { id: reconciliation.id },
      data: { movementId: movement.id, paymentId: payment.id, confirmed: true, confirmedById: user.id, confirmedAt: new Date() }
    });
  });

  revalidatePath("/app/conciliacion");
  revalidatePath("/app/movimientos");
  await redirectSaved("/app/conciliacion");
}

export async function reverseReconciliationAction(formData: FormData) {
  const user = await requireReconciliationManager();
  const reconciliationId = stringValue(formData, "reconciliationId");
  const reason = optionalStringValue(formData, "reason");

  await prisma.$transaction(async (tx) => {
    const reconciliation = await tx.reconciliation.findFirst({
      where: { id: reconciliationId, bankMovement: { bankAccount: { companyId: user.companyId } } },
      include: { payment: { include: { movement: { include: { payments: true } } } } }
    });
    if (!reconciliation || !reconciliation.confirmed || reconciliation.reversed) {
      throw new Error("La conciliacion no existe o no puede revertirse.");
    }

    if (reconciliation.payment && !reconciliation.payment.cancelledAt) {
      const payment = reconciliation.payment;
      const cancelled = await tx.payment.update({
        where: { id: payment.id },
        data: { cancelledAt: new Date(), cancelReason: reason ?? "Reversion de conciliacion bancaria" }
      });
      const nextPayments = payment.movement.payments.map((item) => (item.id === cancelled.id ? cancelled : item));
      const nextStatus = statusFromPayments(payment.movement.amount, nextPayments);
      await tx.movement.update({
        where: { id: payment.movementId },
        data: { status: nextStatus, realDate: nextStatus === "PAID_OR_COLLECTED" ? payment.movement.realDate : null }
      });
    }

    await tx.reconciliation.update({
      where: { id: reconciliation.id },
      data: { reversed: true, reversedAt: new Date(), reversalReason: reason }
    });
  });

  revalidatePath("/app/conciliacion");
  revalidatePath("/app/movimientos");
  await redirectSaved("/app/conciliacion");
}

/**
 * Borra una fila de la cartola que aun no fue confirmada (sin Payment ni
 * Movement asociados todavia), respetando el orden de las relaciones sin
 * onDelete: Cascade en el esquema (Reconciliation -> BankMovement). El
 * BankImportRow original (datos crudos de la fila) se deja como respaldo de
 * auditoria mientras el lote siga existiendo.
 */
async function deleteUnconfirmedBankMovement(tx: Prisma.TransactionClient, bankMovementId: string) {
  await tx.reconciliation.deleteMany({ where: { bankMovementId } });
  await tx.bankMovement.delete({ where: { id: bankMovementId } });
}

/**
 * BankImportRow no tiene onDelete: Cascade hacia BankImportBatch (FK con
 * RESTRICT), asi que hay que vaciarla antes de poder borrar un lote que
 * quedo sin BankMovement.
 */
async function deleteEmptyBatch(tx: Prisma.TransactionClient, batchId: string) {
  await tx.bankImportRow.deleteMany({ where: { batchId } });
  await tx.bankImportBatch.delete({ where: { id: batchId } });
}

export async function discardBankMovementAction(formData: FormData) {
  const user = await requireReconciliationManager();
  const reconciliationId = stringValue(formData, "reconciliationId");

  await prisma.$transaction(async (tx) => {
    const reconciliation = await tx.reconciliation.findFirst({
      where: { id: reconciliationId, bankMovement: { bankAccount: { companyId: user.companyId } } },
      include: { bankMovement: true }
    });
    if (!reconciliation) {
      throw new Error("La fila no existe.");
    }
    if (reconciliation.confirmed) {
      throw new Error("Esta fila ya fue conciliada; usa Revertir en vez de descartar.");
    }

    const batchId = reconciliation.bankMovement.batchId;
    await deleteUnconfirmedBankMovement(tx, reconciliation.bankMovementId);

    const remaining = await tx.bankMovement.count({ where: { batchId } });
    if (remaining === 0) {
      await deleteEmptyBatch(tx, batchId);
    }
  });

  revalidatePath("/app/conciliacion");
  await redirectSaved("/app/conciliacion");
}

export async function cancelImportBatchAction(formData: FormData) {
  const user = await requireReconciliationManager();
  const batchId = stringValue(formData, "batchId");

  await prisma.$transaction(async (tx) => {
    const batch = await tx.bankImportBatch.findFirst({
      where: { id: batchId, companyId: user.companyId },
      include: { bankMovements: { include: { reconciliation: true } } }
    });
    if (!batch) {
      throw new Error("La importacion no existe.");
    }

    const unconfirmed = batch.bankMovements.filter((row) => !row.reconciliation?.confirmed);
    for (const row of unconfirmed) {
      await deleteUnconfirmedBankMovement(tx, row.id);
    }

    const remaining = await tx.bankMovement.count({ where: { batchId } });
    if (remaining === 0) {
      await deleteEmptyBatch(tx, batchId);
    }
  });

  revalidatePath("/app/conciliacion");
  await redirectSaved("/app/conciliacion");
}
