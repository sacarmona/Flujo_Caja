import type { PrismaClient } from "@prisma/client";
import type { MovementStatus } from "@prisma/client";
import { generateRecurrenceOccurrences, dateKey } from "./recurrences";
import { resolveConversionAllowManualFallback, type ExchangeRateProvider } from "./exchange-rates";

type RecurrenceServiceOptions = {
  prisma: PrismaClient;
  exchangeRateProvider: ExchangeRateProvider;
  holidays?: string[];
  months?: number;
};

export const preservedRecurrenceMovementStatuses = ["PAID_OR_COLLECTED", "PARTIALLY_PAID"] as const satisfies MovementStatus[];

export function shouldPreserveRecurrenceMovement(status: MovementStatus): boolean {
  return preservedRecurrenceMovementStatuses.includes(status as (typeof preservedRecurrenceMovementStatuses)[number]);
}

export function shouldRewriteRecurrenceMovement(status: MovementStatus): boolean {
  return !shouldPreserveRecurrenceMovement(status);
}

export function filterNewRecurrenceOccurrences<T extends { projectedDate: Date }>(occurrences: T[], existingProjectedDateKeys: string[]): T[] {
  const existing = new Set(existingProjectedDateKeys);

  return occurrences.filter((occurrence) => !existing.has(dateKey(occurrence.projectedDate)));
}

export async function generateMovementsForRecurrence(ruleId: string, options: RecurrenceServiceOptions) {
  return options.prisma.$transaction(async (tx) => {
    const rule = await tx.recurrenceRule.findUnique({
      where: { id: ruleId },
      include: {
        movements: {
          where: { recurrenceOccurrenceDate: { not: null } },
          select: { recurrenceOccurrenceDate: true, projectedDate: true, deletedAt: true }
        }
      }
    });

    if (!rule || !rule.isActive) {
      return { created: 0, skipped: 0 };
    }

    const existingKeys = rule.movements
      .map((movement) => movement.recurrenceOccurrenceDate)
      .filter((date): date is Date => Boolean(date))
      .map(dateKey);
    const existingProjectedDateKeys = rule.movements
      .filter((movement) => !movement.deletedAt)
      .map((movement) => dateKey(movement.projectedDate));
    const generatedOccurrences = generateRecurrenceOccurrences(
      {
        frequency: rule.frequency,
        intervalDays: rule.intervalDays,
        dayOfMonth: rule.dayOfMonth,
        dayOfWeek: rule.dayOfWeek,
        startDate: rule.startDate,
        endDate: rule.endDate
      },
      {
        holidays: options.holidays,
        months: options.months ?? 12,
        existingOccurrenceKeys: existingKeys
      }
    );
    const occurrences = filterNewRecurrenceOccurrences(generatedOccurrences, existingProjectedDateKeys);

    let created = 0;

    for (const occurrence of occurrences) {
      const conversion = await resolveConversionAllowManualFallback({
        amount: rule.amount,
        currency: rule.currency,
        date: occurrence.projectedDate,
        provider: options.exchangeRateProvider,
        manualRate: rule.manualRate?.toString() ?? null,
        manualReason: rule.manualRateReason,
        preferAutomatic: true
      });

      await tx.movement.create({
        data: {
          companyId: rule.companyId,
          recurrenceRuleId: rule.id,
          recurrenceOccurrenceDate: occurrence.occurrenceDate,
          businessUnitId: rule.businessUnitId,
          accountingAccountId: rule.accountingAccountId,
          bankAccountId: rule.bankAccountId,
          projectId: rule.projectId,
          costCenterId: rule.costCenterId,
          type: rule.type,
          status: rule.status,
          description: rule.description,
          amount: rule.amount,
          currency: rule.currency,
          projectedDate: occurrence.projectedDate,
          realDate: null,
          notes: rule.notes,
          ...conversion
        }
      });
      created += 1;
    }

    return { created, skipped: existingKeys.length + (generatedOccurrences.length - occurrences.length) };
  });
}

export async function deactivateRecurrenceRule(ruleId: string, prisma: PrismaClient) {
  return prisma.recurrenceRule.update({
    where: { id: ruleId },
    data: {
      isActive: false,
      deactivatedAt: new Date()
    }
  });
}

export async function editSingleOccurrence(
  movementId: string,
  prisma: PrismaClient,
  data: {
    description?: string;
    projectedDate?: Date;
    notes?: string | null;
  }
) {
  return prisma.movement.update({
    where: { id: movementId },
    data
  });
}

export function prepareThisAndFollowingScope() {
  return {
    scope: "THIS_AND_FOLLOWING" as const,
    implemented: false
  };
}
