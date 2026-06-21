import { describe, expect, it, vi } from "vitest";
import {
  filterNewRecurrenceOccurrences,
  generateMovementsForRecurrence,
  shouldPreserveRecurrenceMovement,
  shouldRewriteRecurrenceMovement
} from "./recurrence-service";

describe("recurrence service status rules", () => {
  it("preserves paid and partially paid generated movements", () => {
    expect(shouldPreserveRecurrenceMovement("PAID_OR_COLLECTED")).toBe(true);
    expect(shouldPreserveRecurrenceMovement("PARTIALLY_PAID")).toBe(true);
    expect(shouldRewriteRecurrenceMovement("PAID_OR_COLLECTED")).toBe(false);
    expect(shouldRewriteRecurrenceMovement("PARTIALLY_PAID")).toBe(false);
  });

  it("allows rewriting or pruning open generated movements", () => {
    expect(shouldRewriteRecurrenceMovement("PROJECTED")).toBe(true);
    expect(shouldRewriteRecurrenceMovement("PENDING")).toBe(true);
    expect(shouldRewriteRecurrenceMovement("OVERDUE")).toBe(true);
    expect(shouldRewriteRecurrenceMovement("CANCELLED")).toBe(true);
  });

  it("skips new recurrence occurrences when the projected date already exists", () => {
    const occurrences = [
      { occurrenceDate: new Date(2026, 5, 29), projectedDate: new Date(2026, 5, 29) },
      { occurrenceDate: new Date(2026, 6, 29), projectedDate: new Date(2026, 6, 29) }
    ];

    expect(filterNewRecurrenceOccurrences(occurrences, ["2026-06-29"])).toEqual([occurrences[1]]);
  });

  it("si la tasa de cambio falla para una fecha, salta esa ocurrencia y sigue con las demas en vez de cancelar todo", async () => {
    const rule = {
      id: "rule-1",
      companyId: "company-1",
      isActive: true,
      movements: [],
      frequency: "MONTHLY" as const,
      intervalDays: null,
      dayOfMonth: 15,
      dayOfWeek: null,
      startDate: new Date(2026, 0, 15),
      endDate: null,
      amount: "100",
      currency: "USD" as const,
      businessUnitId: "unit-1",
      accountingAccountId: "acc-1",
      bankAccountId: "bank-1",
      projectId: null,
      costCenterId: null,
      type: "EXPENSE" as const,
      status: "PROJECTED" as const,
      description: "Suscripcion",
      notes: null,
      manualRate: null,
      manualRateReason: null
    };

    const tx = {
      recurrenceRule: { findUnique: vi.fn().mockResolvedValue(rule) },
      movement: { create: vi.fn().mockResolvedValue({}) }
    };
    const prisma = { $transaction: (fn: (transactionClient: typeof tx) => unknown) => fn(tx) } as never;

    const provider = {
      getRate: vi.fn().mockImplementation((_currency: string, date: Date) => {
        if (date.getMonth() === 1) {
          return Promise.reject(new Error("mindicador.cl no tiene dato de USD para esa fecha."));
        }
        return Promise.resolve({ currency: "USD", date, rate: 900, source: "mindicador.cl" });
      })
    };

    const result = await generateMovementsForRecurrence("rule-1", {
      prisma,
      exchangeRateProvider: provider as never,
      months: 2
    });

    expect(result.created).toBe(2);
    expect(result.conversionErrors).toHaveLength(1);
    expect(result.conversionErrors[0]).toContain("no tiene dato de USD");
    expect(tx.movement.create).toHaveBeenCalledTimes(2);
  });
});
