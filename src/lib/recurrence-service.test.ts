import { describe, expect, it } from "vitest";
import { filterNewRecurrenceOccurrences, shouldPreserveRecurrenceMovement, shouldRewriteRecurrenceMovement } from "./recurrence-service";

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
});
