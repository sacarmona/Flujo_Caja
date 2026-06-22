"use server";

import type { Currency, MovementStatus, MovementType, RecurrenceFrequency } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { resolveConversionAllowManualFallback } from "@/lib/exchange-rates";
import { CachedHttpExchangeRateProvider } from "@/lib/exchange-rate-providers";
import { generateRecurrenceOccurrences, dateKey } from "@/lib/recurrences";
import {
  assertCanManageRecurrences,
  validateRecurrenceInput,
  type RecurrenceFormInput
} from "@/lib/recurrence-rules";
import { generateMovementsForRecurrence, shouldPreserveRecurrenceMovement, shouldRewriteRecurrenceMovement } from "@/lib/recurrence-service";
import { parseRecurrenceImportFile, resolveRecurrenceImportRow, type RecurrenceImportReferenceData } from "@/lib/recurrence-import";
import type { RecurrenceImportState } from "@/lib/recurrence-import-state";
import type { GenerateMovementsState } from "@/lib/generate-movements-state";
import { getCurrentUser } from "@/lib/auth";
import { getHolidayKeys } from "@/lib/holidays-cl";
import { prisma } from "@/lib/prisma";

function stringValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalStringValue(formData: FormData, key: string): string | null {
  const value = stringValue(formData, key);
  return value ? value : null;
}

function formInput(formData: FormData): RecurrenceFormInput {
  return {
    type: stringValue(formData, "type") as MovementType,
    accountingAccountId: stringValue(formData, "accountingAccountId"),
    description: stringValue(formData, "description"),
    amount: stringValue(formData, "amount"),
    currency: stringValue(formData, "currency") as Currency,
    manualRate: optionalStringValue(formData, "manualRate"),
    manualRateReason: optionalStringValue(formData, "manualRateReason"),
    bankAccountId: stringValue(formData, "bankAccountId"),
    businessUnitId: stringValue(formData, "businessUnitId"),
    projectId: optionalStringValue(formData, "projectId"),
    costCenterId: optionalStringValue(formData, "costCenterId"),
    frequency: stringValue(formData, "frequency") as RecurrenceFrequency,
    intervalDays: optionalStringValue(formData, "intervalDays"),
    dayOfMonth: optionalStringValue(formData, "dayOfMonth"),
    dayOfWeek: optionalStringValue(formData, "dayOfWeek"),
    startDate: stringValue(formData, "startDate"),
    endDate: optionalStringValue(formData, "endDate"),
    status: stringValue(formData, "status") as MovementStatus,
    notes: optionalStringValue(formData, "notes")
  };
}

async function requireRecurrenceManager() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Debes iniciar sesion.");
  }
  assertCanManageRecurrences(user.role);
  return user;
}

async function references(companyId: string, input: RecurrenceFormInput) {
  const [accountingAccount, bankAccount, businessUnit, project, costCenter] = await Promise.all([
    prisma.accountingAccount.findFirst({
      where: { id: input.accountingAccountId, companyId },
      include: { _count: { select: { children: true } } }
    }),
    prisma.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId } }),
    prisma.businessUnit.findFirst({ where: { id: input.businessUnitId, companyId } }),
    input.projectId ? prisma.project.findFirst({ where: { id: input.projectId, companyId } }) : Promise.resolve(null),
    input.costCenterId ? prisma.costCenter.findFirst({ where: { id: input.costCenterId, companyId } }) : Promise.resolve(null)
  ]);

  return { accountingAccount, bankAccount, businessUnit, project, costCenter };
}

async function audit(params: {
  companyId: string;
  userId: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "CANCEL";
  before?: unknown;
  after?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      companyId: params.companyId,
      userId: params.userId,
      entity: "RecurrenceRule",
      entityId: params.entityId,
      action: params.action,
      before: params.before === undefined ? undefined : JSON.parse(JSON.stringify(params.before)),
      after: params.after === undefined ? undefined : JSON.parse(JSON.stringify(params.after))
    }
  });
}

export async function createRecurrenceAction(formData: FormData) {
  const user = await requireRecurrenceManager();
  const input = formInput(formData);
  const data = validateRecurrenceInput(input, await references(user.companyId, input));
  const created = await prisma.recurrenceRule.create({
    data: {
      companyId: user.companyId,
      ...data
    }
  });

  await audit({ companyId: user.companyId, userId: user.id, entityId: created.id, action: "CREATE", after: created });
  revalidatePath("/app/recurrentes");
}

async function loadImportReferenceData(companyId: string): Promise<RecurrenceImportReferenceData> {
  const [accounts, bankAccounts, businessUnits, projects, costCenters] = await Promise.all([
    prisma.accountingAccount.findMany({
      where: { companyId, isActive: true, allowMovements: true, deletedAt: null, children: { none: {} } },
      include: { _count: { select: { children: true } } }
    }),
    prisma.bankAccount.findMany({ where: { companyId, isActive: true, deletedAt: null } }),
    prisma.businessUnit.findMany({ where: { companyId, isActive: true, deletedAt: null } }),
    prisma.project.findMany({ where: { companyId, isActive: true, deletedAt: null } }),
    prisma.costCenter.findMany({ where: { companyId, isActive: true, deletedAt: null } })
  ]);

  return { accounts, bankAccounts, businessUnits, projects, costCenters };
}

export async function previewRecurrenceImportAction(
  _prevState: RecurrenceImportState,
  formData: FormData
): Promise<RecurrenceImportState> {
  const user = await requireRecurrenceManager();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Selecciona un archivo CSV o XLSX para importar." };
  }

  let rawRows;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    rawRows = await parseRecurrenceImportFile(buffer, file.name);
  } catch {
    return { status: "error", message: "No se pudo leer el archivo. Verifica que sea un CSV o XLSX valido." };
  }

  if (rawRows.length === 0) {
    return { status: "error", message: "El archivo no tiene filas para importar." };
  }

  const refs = await loadImportReferenceData(user.companyId);
  const results = rawRows.map((raw, index) => resolveRecurrenceImportRow(raw, index + 2, refs));
  const validCount = results.filter((result) => result.status === "ok").length;

  return {
    status: "previewed",
    fileName: file.name,
    results,
    validCount,
    errorCount: results.length - validCount
  };
}

export async function commitRecurrenceImportAction(
  _prevState: RecurrenceImportState,
  formData: FormData
): Promise<RecurrenceImportState> {
  const user = await requireRecurrenceManager();
  const rowsJson = stringValue(formData, "rows");

  if (!rowsJson) {
    return { status: "error", message: "No hay filas validas para importar." };
  }

  let inputs: RecurrenceFormInput[];
  try {
    inputs = JSON.parse(rowsJson);
  } catch {
    return { status: "error", message: "Los datos a importar son invalidos." };
  }

  const refs = await loadImportReferenceData(user.companyId);
  const rowErrors: string[] = [];
  let created = 0;

  for (const [index, input] of inputs.entries()) {
    try {
      const account = refs.accounts.find((item) => item.id === input.accountingAccountId);
      const bankAccount = refs.bankAccounts.find((item) => item.id === input.bankAccountId);
      const businessUnit = refs.businessUnits.find((item) => item.id === input.businessUnitId);
      const project = input.projectId ? refs.projects.find((item) => item.id === input.projectId) ?? null : null;
      const costCenter = input.costCenterId ? refs.costCenters.find((item) => item.id === input.costCenterId) ?? null : null;
      const data = validateRecurrenceInput(input, { accountingAccount: account, bankAccount, businessUnit, project, costCenter });
      const createdRule = await prisma.recurrenceRule.create({ data: { companyId: user.companyId, ...data } });
      await audit({ companyId: user.companyId, userId: user.id, entityId: createdRule.id, action: "CREATE", after: createdRule });
      created += 1;
    } catch (error) {
      rowErrors.push(`Fila ${index + 1}: ${error instanceof Error ? error.message : "error desconocido."}`);
    }
  }

  revalidatePath("/app/recurrentes");

  return {
    status: "committed",
    createdCount: created,
    message:
      rowErrors.length > 0
        ? `Se crearon ${created} reglas. Filas con error: ${rowErrors.join(" | ")}`
        : `Se crearon ${created} reglas correctamente.`
  };
}

export async function updateRecurrenceAction(formData: FormData) {
  const user = await requireRecurrenceManager();
  const id = stringValue(formData, "id");
  const current = await prisma.recurrenceRule.findFirst({ where: { id, companyId: user.companyId } });
  if (!current) {
    throw new Error("La recurrencia no existe.");
  }

  const input = formInput(formData);
  const data = validateRecurrenceInput(input, await references(user.companyId, input));
  const holidays = await getHolidayKeys(prisma);

  /**
   * El indice unico (recurrenceRuleId, recurrenceOccurrenceDate) no excluye
   * filas con deletedAt seteado. Movimientos borrados antes de liberar esa
   * fecha (desactivar/cancelar la regla) quedan "reservando" la fecha para
   * siempre y rompen la regeneracion de ocurrencias con P2002. Se libera
   * aqui antes de generar las nuevas ocurrencias.
   */
  await prisma.movement.updateMany({
    where: { recurrenceRuleId: id, deletedAt: { not: null }, recurrenceOccurrenceDate: { not: null } },
    data: { recurrenceOccurrenceDate: null }
  });

  const movements = await prisma.movement.findMany({
    where: {
      companyId: user.companyId,
      recurrenceRuleId: id,
      deletedAt: null
    },
    orderBy: [{ recurrenceOccurrenceDate: "asc" }, { projectedDate: "asc" }, { createdAt: "asc" }]
  });
  const preservedKeys = movements
    .filter((movement) => shouldPreserveRecurrenceMovement(movement.status))
    .map((movement) => movement.recurrenceOccurrenceDate)
    .filter((date): date is Date => Boolean(date))
    .map(dateKey);
  const rewriteMovements = movements.filter((movement) => shouldRewriteRecurrenceMovement(movement.status));
  const occurrences = generateRecurrenceOccurrences(
    {
      frequency: data.frequency,
      intervalDays: data.intervalDays,
      dayOfMonth: data.dayOfMonth,
      dayOfWeek: data.dayOfWeek,
      startDate: data.startDate,
      endDate: data.endDate
    },
    {
      holidays,
      months: 12,
      existingOccurrenceKeys: preservedKeys
    }
  );

  /**
   * Resuelve las tasas de cambio ANTES de abrir la transaccion: una consulta
   * a mindicador.cl por ocurrencia puede tardar mas que el limite de 5s de
   * una transaccion interactiva de Prisma si hay varias fechas sin tasa
   * cacheada. Las ocurrencias sin tasa disponible se saltan (ver
   * conversionErrors) en vez de bloquear toda la edicion.
   */
  const provider = new CachedHttpExchangeRateProvider(prisma, user.companyId);
  const conversionsByMovementId = new Map<string, Awaited<ReturnType<typeof resolveConversionAllowManualFallback>>>();
  const conversionErrors: string[] = [];

  for (const [index, movement] of rewriteMovements.entries()) {
    const occurrence = occurrences[index];
    if (!occurrence) {
      continue;
    }

    try {
      const conversion = await resolveConversionAllowManualFallback({
        amount: data.amount,
        currency: data.currency,
        date: occurrence.projectedDate,
        provider,
        manualRate: data.manualRate?.toString() ?? null,
        manualReason: data.manualRateReason,
        preferAutomatic: true
      });
      conversionsByMovementId.set(movement.id, conversion);
    } catch (error) {
      conversionErrors.push(`${dateKey(occurrence.projectedDate)}: ${error instanceof Error ? error.message : "error desconocido"}`);
    }
  }

  await prisma.$transaction(async (tx) => {
    const saved = await tx.recurrenceRule.update({
      where: { id },
      data
    });

    if (rewriteMovements.length > 0) {
      await tx.movement.updateMany({
        where: { id: { in: rewriteMovements.map((movement) => movement.id) } },
        data: { recurrenceOccurrenceDate: null }
      });
    }

    for (const [index, movement] of rewriteMovements.entries()) {
      const occurrence = occurrences[index];

      if (!occurrence) {
        const updatedMovement = await tx.movement.update({
          where: { id: movement.id },
          data: {
            deletedAt: new Date(),
            notes: movement.notes ?? "Eliminado por cambio de recurrencia."
          }
        });
        await tx.auditLog.create({
          data: {
            companyId: user.companyId,
            userId: user.id,
            entity: "Movement",
            entityId: movement.id,
            action: "SOFT_DELETE",
            before: JSON.parse(JSON.stringify(movement)),
            after: JSON.parse(JSON.stringify(updatedMovement)),
            metadata: {
              source: "recurrence-series-update",
              recurrenceRuleId: id
            }
          }
        });
        continue;
      }

      const conversion = conversionsByMovementId.get(movement.id);
      if (!conversion) {
        // Sin tasa disponible para esta fecha (ver conversionErrors); se deja el movimiento sin tocar.
        continue;
      }

      const updatedMovement = await tx.movement.update({
        where: { id: movement.id },
        data: {
          recurrenceOccurrenceDate: occurrence.occurrenceDate,
          businessUnitId: saved.businessUnitId,
          accountingAccountId: saved.accountingAccountId,
          bankAccountId: saved.bankAccountId,
          projectId: saved.projectId,
          costCenterId: saved.costCenterId,
          type: saved.type,
          status: saved.status,
          description: saved.description,
          amount: saved.amount,
          currency: saved.currency,
          projectedDate: occurrence.projectedDate,
          realDate: null,
          notes: saved.notes,
          ...conversion
        }
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          entity: "Movement",
          entityId: movement.id,
          action: "UPDATE",
          before: JSON.parse(JSON.stringify(movement)),
          after: JSON.parse(JSON.stringify(updatedMovement)),
          metadata: {
            source: "recurrence-series-update",
            recurrenceRuleId: id,
            generatedAdditionalMovements: 0
          }
        }
      });
    }

    await tx.auditLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        entity: "RecurrenceRule",
        entityId: id,
        action: "UPDATE",
        before: JSON.parse(JSON.stringify(current)),
        after: JSON.parse(JSON.stringify(saved)),
        metadata: {
          source: "recurrence-series-update",
          rewrittenMovements: rewriteMovements.length,
          preservedMovements: movements.length - rewriteMovements.length,
          conversionErrors,
          generatedAdditionalMovements: 0
        }
      }
    });

    return saved;
  });

  revalidatePath("/app/recurrentes");
  revalidatePath("/app/movimientos");
  revalidatePath("/app/calendario");

  if (conversionErrors.length > 0) {
    throw new Error(
      `La regla se actualizo, pero no se pudo obtener la tasa de cambio para ${conversionErrors.length} fecha(s): ${conversionErrors.join(" | ")}. Esos movimientos quedaron sin actualizar; agrega una tasa manual a la regla y reintenta.`
    );
  }
}

/**
 * "Esta y las siguientes ocurrencias" (THIS_AND_FOLLOWING): divide la regla
 * en dos en la fecha de inicio enviada por el formulario (la pagina de
 * detalle de movimiento la precarga con la fecha de la ocurrencia que se
 * esta editando). La regla original queda intacta para todo lo anterior a
 * esa fecha (su `endDate` se recorta al dia previo); una regla nueva, con
 * los datos editados, toma el resto del horizonte. Las ocurrencias futuras
 * ya pagadas o con pago parcial (shouldPreserveRecurrenceMovement) se dejan
 * sin tocar, igual que en la edicion completa de la regla.
 */
export async function editThisAndFollowingAction(formData: FormData) {
  const user = await requireRecurrenceManager();
  const id = stringValue(formData, "id");
  const current = await prisma.recurrenceRule.findFirst({ where: { id, companyId: user.companyId } });
  if (!current) {
    throw new Error("La recurrencia no existe.");
  }

  const input = formInput(formData);
  const data = validateRecurrenceInput(input, await references(user.companyId, input));
  const splitDate = data.startDate;

  if (splitDate.getTime() <= current.startDate.getTime()) {
    // No queda ningun periodo "anterior" que preservar: equivale a editar toda la regla.
    return updateRecurrenceAction(formData);
  }

  const holidays = await getHolidayKeys(prisma);

  await prisma.movement.updateMany({
    where: { recurrenceRuleId: id, deletedAt: { not: null }, recurrenceOccurrenceDate: { not: null, gte: splitDate } },
    data: { recurrenceOccurrenceDate: null }
  });

  const futureMovements = await prisma.movement.findMany({
    where: { companyId: user.companyId, recurrenceRuleId: id, deletedAt: null, recurrenceOccurrenceDate: { gte: splitDate } },
    orderBy: [{ recurrenceOccurrenceDate: "asc" }]
  });
  const preservedKeys = futureMovements
    .filter((movement) => shouldPreserveRecurrenceMovement(movement.status))
    .map((movement) => movement.recurrenceOccurrenceDate)
    .filter((date): date is Date => Boolean(date))
    .map(dateKey);
  const rewriteMovements = futureMovements.filter((movement) => shouldRewriteRecurrenceMovement(movement.status));
  const occurrences = generateRecurrenceOccurrences(
    {
      frequency: data.frequency,
      intervalDays: data.intervalDays,
      dayOfMonth: data.dayOfMonth,
      dayOfWeek: data.dayOfWeek,
      startDate: splitDate,
      endDate: data.endDate
    },
    { holidays, months: 12, existingOccurrenceKeys: preservedKeys }
  );

  const provider = new CachedHttpExchangeRateProvider(prisma, user.companyId);
  const conversionsByMovementId = new Map<string, Awaited<ReturnType<typeof resolveConversionAllowManualFallback>>>();
  const conversionErrors: string[] = [];

  for (const [index, movement] of rewriteMovements.entries()) {
    const occurrence = occurrences[index];
    if (!occurrence) {
      continue;
    }

    try {
      const conversion = await resolveConversionAllowManualFallback({
        amount: data.amount,
        currency: data.currency,
        date: occurrence.projectedDate,
        provider,
        manualRate: data.manualRate?.toString() ?? null,
        manualReason: data.manualRateReason,
        preferAutomatic: true
      });
      conversionsByMovementId.set(movement.id, conversion);
    } catch (error) {
      conversionErrors.push(`${dateKey(occurrence.projectedDate)}: ${error instanceof Error ? error.message : "error desconocido"}`);
    }
  }

  const trimmedOldEndDate = new Date(splitDate.getTime() - 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    const trimmedOld = await tx.recurrenceRule.update({
      where: { id },
      data: { endDate: trimmedOldEndDate, nextEditScope: "THIS_AND_FOLLOWING" }
    });
    await tx.auditLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        entity: "RecurrenceRule",
        entityId: id,
        action: "UPDATE",
        before: JSON.parse(JSON.stringify(current)),
        after: JSON.parse(JSON.stringify(trimmedOld)),
        metadata: { source: "this-and-following-split", role: "predecessor" }
      }
    });

    const newRule = await tx.recurrenceRule.create({
      data: {
        companyId: user.companyId,
        businessUnitId: data.businessUnitId,
        accountingAccountId: data.accountingAccountId,
        bankAccountId: data.bankAccountId,
        projectId: data.projectId,
        costCenterId: data.costCenterId,
        type: data.type,
        description: data.description,
        amount: data.amount,
        currency: data.currency,
        manualRate: data.manualRate,
        manualRateReason: data.manualRateReason,
        frequency: data.frequency,
        intervalDays: data.intervalDays,
        dayOfMonth: data.dayOfMonth,
        dayOfWeek: data.dayOfWeek,
        startDate: splitDate,
        endDate: data.endDate,
        status: data.status,
        notes: data.notes,
        isActive: current.isActive
      }
    });
    await tx.auditLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        entity: "RecurrenceRule",
        entityId: newRule.id,
        action: "CREATE",
        after: JSON.parse(JSON.stringify(newRule)),
        metadata: { source: "this-and-following-split", predecessorRuleId: id }
      }
    });

    if (rewriteMovements.length > 0) {
      await tx.movement.updateMany({
        where: { id: { in: rewriteMovements.map((movement) => movement.id) } },
        data: { recurrenceOccurrenceDate: null }
      });
    }

    for (const [index, movement] of rewriteMovements.entries()) {
      const occurrence = occurrences[index];

      if (!occurrence) {
        const updatedMovement = await tx.movement.update({
          where: { id: movement.id },
          data: {
            deletedAt: new Date(),
            notes: movement.notes ?? "Eliminado por cambio de recurrencia (esta y las siguientes)."
          }
        });
        await tx.auditLog.create({
          data: {
            companyId: user.companyId,
            userId: user.id,
            entity: "Movement",
            entityId: movement.id,
            action: "SOFT_DELETE",
            before: JSON.parse(JSON.stringify(movement)),
            after: JSON.parse(JSON.stringify(updatedMovement)),
            metadata: { source: "this-and-following-split", recurrenceRuleId: newRule.id, predecessorRuleId: id }
          }
        });
        continue;
      }

      const conversion = conversionsByMovementId.get(movement.id);
      if (!conversion) {
        // Sin tasa disponible para esta fecha (ver conversionErrors); se deja el movimiento sin tocar.
        continue;
      }

      const updatedMovement = await tx.movement.update({
        where: { id: movement.id },
        data: {
          recurrenceRuleId: newRule.id,
          recurrenceOccurrenceDate: occurrence.occurrenceDate,
          businessUnitId: newRule.businessUnitId,
          accountingAccountId: newRule.accountingAccountId,
          bankAccountId: newRule.bankAccountId,
          projectId: newRule.projectId,
          costCenterId: newRule.costCenterId,
          type: newRule.type,
          status: newRule.status,
          description: newRule.description,
          amount: newRule.amount,
          currency: newRule.currency,
          projectedDate: occurrence.projectedDate,
          realDate: null,
          notes: newRule.notes,
          ...conversion
        }
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          entity: "Movement",
          entityId: movement.id,
          action: "UPDATE",
          before: JSON.parse(JSON.stringify(movement)),
          after: JSON.parse(JSON.stringify(updatedMovement)),
          metadata: { source: "this-and-following-split", recurrenceRuleId: newRule.id, predecessorRuleId: id }
        }
      });
    }
  });

  revalidatePath("/app/recurrentes");
  revalidatePath("/app/movimientos");
  revalidatePath("/app/calendario");

  if (conversionErrors.length > 0) {
    throw new Error(
      `Se aplico el cambio a "esta y las siguientes ocurrencias", pero no se pudo obtener la tasa de cambio para ${conversionErrors.length} fecha(s): ${conversionErrors.join(" | ")}. Esos movimientos quedaron sin actualizar; agrega una tasa manual y reintenta.`
    );
  }
}

export async function setRecurrenceActiveAction(formData: FormData) {
  const user = await requireRecurrenceManager();
  const id = stringValue(formData, "id");
  const active = stringValue(formData, "active") === "true";
  const confirmed = formData.get("confirmDeactivate") === "on";
  const current = await prisma.recurrenceRule.findFirst({
    where: { id, companyId: user.companyId },
    include: { _count: { select: { movements: true } } }
  });

  if (!current) {
    throw new Error("La recurrencia no existe.");
  }

  if (!active && !confirmed) {
    throw new Error("Debes confirmar la desactivacion.");
  }

  await prisma.$transaction(async (tx) => {
    const saved = await tx.recurrenceRule.update({
      where: { id },
      data: {
        isActive: active,
        deactivatedAt: active ? null : new Date()
      }
    });

    let softDeletedMovements = 0;
    let softDeletedMovementIds: string[] = [];
    if (!active) {
      const removableMovements = await tx.movement.findMany({
        where: {
          companyId: user.companyId,
          recurrenceRuleId: id,
          deletedAt: null,
          status: { notIn: ["PAID_OR_COLLECTED", "PARTIALLY_PAID"] }
        }
      });
      softDeletedMovementIds = removableMovements.map((movement) => movement.id);

      if (softDeletedMovementIds.length > 0) {
        const result = await tx.movement.updateMany({
          where: {
            id: { in: softDeletedMovementIds }
          },
          data: {
            deletedAt: new Date(),
            // Libera la fecha para que una futura reactivacion/edicion pueda reusarla (ver indice unico en updateRecurrenceAction).
            recurrenceOccurrenceDate: null
          }
        });
        softDeletedMovements = result.count;
      }
    }

    await tx.auditLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        entity: "RecurrenceRule",
        entityId: id,
        action: active ? "UPDATE" : "CANCEL",
        before: JSON.parse(JSON.stringify(current)),
        after: JSON.parse(JSON.stringify(saved)),
        metadata: {
          source: active ? "recurrence-reactivate" : "recurrence-deactivate",
          softDeletedMovements,
          softDeletedMovementIds
        }
      }
    });

    return saved;
  });

  revalidatePath("/app/recurrentes");
  revalidatePath("/app/movimientos");
  revalidatePath("/app/calendario");
}

export async function generateRecurringMovementsAction(
  _prevState: GenerateMovementsState,
  formData: FormData
): Promise<GenerateMovementsState> {
  const user = await requireRecurrenceManager();
  const id = stringValue(formData, "id");

  let result;
  try {
    const holidays = await getHolidayKeys(prisma);
    result = await generateMovementsForRecurrence(id, {
      prisma,
      exchangeRateProvider: new CachedHttpExchangeRateProvider(prisma, user.companyId),
      holidays,
      months: 12
    });
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "No se pudo generar los movimientos." };
  }

  await prisma.auditLog.create({
    data: {
      companyId: user.companyId,
      userId: user.id,
      entity: "RecurrenceRule",
      entityId: id,
      action: "UPDATE",
      metadata: result
    }
  });
  revalidatePath("/app/recurrentes");
  revalidatePath("/app/movimientos");

  if (result.conversionErrors.length > 0) {
    return { status: "partial", created: result.created, conversionErrors: result.conversionErrors };
  }

  return { status: "success", created: result.created, skipped: result.skipped };
}

export async function getRecurrenceDefaults(companyId: string) {
  const [bankAccount, businessUnit] = await Promise.all([
    prisma.bankAccount.findFirst({
      where: { companyId, name: "Cuenta Corriente Santander", isActive: true, deletedAt: null },
      orderBy: { createdAt: "asc" }
    }),
    prisma.businessUnit.findFirst({
      where: { companyId, name: "Sin asignar", isActive: true, deletedAt: null },
      orderBy: { createdAt: "asc" }
    })
  ]);

  return {
    bankAccountId: bankAccount?.id ?? "",
    businessUnitId: businessUnit?.id ?? ""
  };
}
