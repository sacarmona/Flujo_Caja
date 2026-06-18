import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate } from "./format";

describe("format helpers", () => {
  it("formats CLP amounts using es-CL", () => {
    expect(formatCurrency(1234567)).toBe("$1.234.567");
  });

  it("formats dates in the configured locale", () => {
    expect(formatDate(new Date("2026-06-18T12:00:00.000Z"))).toContain("2026");
  });
});
