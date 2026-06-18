import { describe, expect, it } from "vitest";
import {
  assertCanManageRecurrences,
  generatedMovementLink,
  previewRecurrence,
  validateRecurrenceInput
} from "./recurrence-rules";
import { deactivateRecurrence, generateRecurrenceOccurrences } from "./recurrences";

const refs = {
  accountingAccount: { id: "account", isActive: true, allowMovements: true, deletedAt: null, _count: { children: 0 } },
  bankAccount: { id: "bank", isActive: true, deletedAt: null },
  businessUnit: { id: "unit", isActive: true, deletedAt: null },
  project: null,
  costCenter: null
};

const input = {
  type: "EXPENSE" as const,
  accountingAccountId: "account",
  description: "Arriendo mensual",
  amount: "250000",
  currency: "CLP" as const,
  bankAccountId: "bank",
  businessUnitId: "unit",
  projectId: null,
  costCenterId: null,
  frequency: "MONTHLY" as const,
  intervalDays: null,
  dayOfMonth: "31",
  dayOfWeek: null,
  startDate: "2026-01-31",
  endDate: null,
  status: "PROJECTED" as const,
  notes: "Contrato vigente"
};

describe("recurrence rule helpers", () => {
  it("allows only ADMIN and FINANCE", () => {
    expect(() => assertCanManageRecurrences("ADMIN")).not.toThrow();
    expect(() => assertCanManageRecurrences("FINANCE")).not.toThrow();
    expect(() => assertCanManageRecurrences("MOVEMENT_ENTRY")).toThrow("ADMIN y FINANCE");
  });

  it("validates form input", () => {
    const result = validateRecurrenceInput(input, refs);

    expect(result.amount.toString()).toBe("250000");
    expect(result.dayOfMonth).toBe(31);
  });

  it("rejects invalid every N days forms", () => {
    expect(() => validateRecurrenceInput({ ...input, frequency: "EVERY_N_DAYS", intervalDays: null }, refs)).toThrow("intervalo");
  });

  it("builds a ten-occurrence preview with adjusted dates", () => {
    const preview = previewRecurrence({ frequency: "MONTHLY", intervalDays: null, startDate: new Date(2026, 0, 31), endDate: null });

    expect(preview).toHaveLength(10);
    expect(preview[1].projectedDate.getMonth()).toBe(2);
  });

  it("deactivates without deleting history", () => {
    const deactivated = deactivateRecurrence({ isActive: true, deactivatedAt: null as Date | null }, new Date("2026-06-18T00:00:00.000Z"));

    expect(deactivated.isActive).toBe(false);
    expect(deactivated.deactivatedAt).toBeInstanceOf(Date);
  });

  it("generates without duplicate existing occurrences", () => {
    const occurrences = generateRecurrenceOccurrences(
      { frequency: "WEEKLY", startDate: new Date(2026, 0, 5), endDate: new Date(2026, 0, 19) },
      { existingOccurrenceKeys: ["2026-01-12"] }
    );

    expect(occurrences.map((item) => item.occurrenceDate.toISOString().slice(0, 10))).toEqual(["2026-01-05", "2026-01-19"]);
  });

  it("builds access to generated movements", () => {
    expect(generatedMovementLink("abc 123")).toBe("/app/movimientos?recurrenceRuleId=abc+123");
  });
});
