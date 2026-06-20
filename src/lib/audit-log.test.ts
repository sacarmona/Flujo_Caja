import { describe, expect, it } from "vitest";
import { movementAuditSummary } from "./audit-log";

describe("movementAuditSummary", () => {
  it("usa after cuando esta disponible", () => {
    const summary = movementAuditSummary({
      before: { description: "Antiguo", amount: "1000", type: "EXPENSE" },
      after: { description: "Arriendo oficina", amount: "450000", type: "EXPENSE" }
    });

    expect(summary).toEqual({ description: "Arriendo oficina", amount: 450000, type: "EXPENSE" });
  });

  it("usa before cuando after no existe", () => {
    const summary = movementAuditSummary({
      before: { description: "Pago proveedor", amount: "120000", type: "EXPENSE" },
      after: null
    });

    expect(summary).toEqual({ description: "Pago proveedor", amount: 120000, type: "EXPENSE" });
  });

  it("devuelve valores por defecto cuando no hay datos", () => {
    expect(movementAuditSummary({ before: null, after: null })).toEqual({
      description: "(sin datos)",
      amount: null,
      type: null
    });
  });
});
