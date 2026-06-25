import { describe, expect, it } from "vitest";
import { assertCanModifyMovements, canCancelAndDeleteMovement, isLateMovement, parsePositiveDecimal, validateMovementInput } from "./movements";

const baseInput = {
  type: "INCOME" as const,
  accountingAccountId: "account",
  description: "Servicio de inspección",
  amount: "100000",
  currency: "CLP" as const,
  manualRate: null,
  manualRateReason: null,
  bankAccountId: "bank",
  businessUnitId: "unit",
  projectId: null,
  costCenterId: null,
  projectedDate: "2026-06-18",
  realDate: null,
  status: "PROJECTED" as const,
  notes: null
};

const activeRefs = {
  accountingAccount: {
    id: "account",
    isActive: true,
    allowMovements: true,
    deletedAt: null,
    _count: { children: 0 }
  },
  bankAccount: { id: "bank", isActive: true, deletedAt: null },
  businessUnit: { id: "unit", isActive: true, deletedAt: null },
  project: null,
  costCenter: null
};

describe("movement rules", () => {
  it("validates creation input", () => {
    const result = validateMovementInput(baseInput, activeRefs);

    expect(result.amount.toString()).toBe("100000");
    expect(result.description).toBe("Servicio de inspección");
  });

  it("validates edition input with real date and notes", () => {
    const result = validateMovementInput(
      { ...baseInput, description: "Servicio actualizado", realDate: "2026-06-20", notes: "Factura recibida" },
      activeRefs
    );

    expect(result.realDate?.getFullYear()).toBe(2026);
    expect(result.notes).toBe("Factura recibida");
  });

  it("rejects non-positive gross amounts", () => {
    expect(() => parsePositiveDecimal("0")).toThrow("positivo");
    expect(() => validateMovementInput({ ...baseInput, amount: "-1" }, activeRefs)).toThrow("positivo");
  });

  it("rejects accounts that cannot receive movements", () => {
    expect(() =>
      validateMovementInput(baseInput, {
        ...activeRefs,
        accountingAccount: { ...activeRefs.accountingAccount, allowMovements: false }
      })
    ).toThrow("cuenta contable");
  });

  it("rejects READ_ONLY mutations", () => {
    expect(() => assertCanModifyMovements("READ_ONLY")).toThrow("READ_ONLY");
    expect(() => assertCanModifyMovements("FINANCE")).not.toThrow();
  });

  it("validates cancellation permissions with the same mutation rule", () => {
    expect(() => assertCanModifyMovements("MOVEMENT_ENTRY")).not.toThrow();
  });

  it("allows cancel and delete only for movements entered by mistake without financial activity", () => {
    expect(canCancelAndDeleteMovement({ status: "PROJECTED", payments: [], _count: { reconciliations: 0 } })).toBe(true);
    expect(canCancelAndDeleteMovement({ status: "PENDING", payments: [{}], _count: { reconciliations: 0 } })).toBe(false);
    expect(canCancelAndDeleteMovement({ status: "PARTIALLY_PAID", payments: [], _count: { reconciliations: 0 } })).toBe(false);
    expect(canCancelAndDeleteMovement({ status: "PAID_OR_COLLECTED", payments: [], _count: { reconciliations: 0 } })).toBe(false);
    expect(canCancelAndDeleteMovement({ status: "PROJECTED", payments: [], _count: { reconciliations: 1 } })).toBe(false);
  });

  it("marca como atrasado solo lo Proyectado/Pendiente con fecha proyectada ya pasada", () => {
    const today = new Date(2026, 5, 23);
    expect(isLateMovement({ status: "PROJECTED", projectedDate: new Date(2026, 5, 19) }, today)).toBe(true);
    expect(isLateMovement({ status: "PENDING", projectedDate: new Date(2026, 5, 22) }, today)).toBe(true);
    expect(isLateMovement({ status: "PROJECTED", projectedDate: new Date(2026, 5, 23) }, today)).toBe(false);
    expect(isLateMovement({ status: "PROJECTED", projectedDate: new Date(2026, 5, 25) }, today)).toBe(false);
    expect(isLateMovement({ status: "PARTIALLY_PAID", projectedDate: new Date(2026, 5, 19) }, today)).toBe(false);
    expect(isLateMovement({ status: "PAID_OR_COLLECTED", projectedDate: new Date(2026, 5, 19) }, today)).toBe(false);
    expect(isLateMovement({ status: "CANCELLED", projectedDate: new Date(2026, 5, 19) }, today)).toBe(false);
  });
});
