import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { assertCanManageReconciliation, canManageReconciliation, matchBankRow, type ReconciliationCandidate } from "./reconciliation";

function candidate(overrides: Partial<ReconciliationCandidate> = {}): ReconciliationCandidate {
  return {
    movementId: "mov-1",
    description: "Fact 1616 Adentu Ingenieria",
    projectedDate: new Date(2026, 5, 18),
    type: "EXPENSE",
    pending: new Prisma.Decimal(281308),
    ...overrides
  };
}

describe("reconciliation permissions", () => {
  it("solo ADMIN y FINANCE pueden conciliar", () => {
    expect(canManageReconciliation("ADMIN")).toBe(true);
    expect(canManageReconciliation("FINANCE")).toBe(true);
    expect(canManageReconciliation("MOVEMENT_ENTRY")).toBe(false);
    expect(() => assertCanManageReconciliation("READ_ONLY")).toThrow("ADMIN y FINANCE");
  });
});

describe("matchBankRow", () => {
  it("HIGH cuando hay un unico movimiento con el mismo saldo pendiente y misma fecha", () => {
    const result = matchBankRow(
      { amount: new Prisma.Decimal(-281308), type: "CARGO", date: new Date(2026, 5, 18) },
      [candidate()]
    );

    expect(result.matchLevel).toBe("HIGH");
    expect(result.movementId).toBe("mov-1");
  });

  it("POSSIBLE cuando el monto coincide pero la fecha es distinta", () => {
    const result = matchBankRow(
      { amount: new Prisma.Decimal(-281308), type: "CARGO", date: new Date(2026, 5, 20) },
      [candidate()]
    );

    expect(result.matchLevel).toBe("POSSIBLE");
    expect(result.movementId).toBe("mov-1");
    expect(result.candidates).toHaveLength(1);
  });

  it("POSSIBLE sin movimiento sugerido cuando hay varios candidatos con el mismo monto", () => {
    const result = matchBankRow(
      { amount: new Prisma.Decimal(-281308), type: "CARGO", date: new Date(2026, 5, 18) },
      [candidate({ movementId: "mov-1" }), candidate({ movementId: "mov-2" })]
    );

    expect(result.matchLevel).toBe("POSSIBLE");
    expect(result.movementId).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });

  it("NONE cuando ningun movimiento tiene ese saldo pendiente", () => {
    const result = matchBankRow({ amount: new Prisma.Decimal(-999), type: "CARGO", date: new Date(2026, 5, 18) }, [candidate()]);

    expect(result.matchLevel).toBe("NONE");
    expect(result.movementId).toBeNull();
  });

  it("no cruza tipos: un abono no calza con un movimiento de egreso aunque el monto coincida", () => {
    const result = matchBankRow(
      { amount: new Prisma.Decimal(281308), type: "ABONO", date: new Date(2026, 5, 18) },
      [candidate({ type: "EXPENSE" })]
    );

    expect(result.matchLevel).toBe("NONE");
  });
});
