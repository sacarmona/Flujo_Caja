import { describe, expect, it } from "vitest";
import {
  assertCanRegisterPayment,
  nextRealDateAfterPayment,
  pendingBalance,
  statusFromPayments,
  totalPaid,
  validatePaymentAmount
} from "./payments";

const movement = {
  amount: "100000",
  projectedAmountClp: "100000",
  currency: "CLP" as const,
  status: "PENDING" as const,
  cancelledAt: null,
  deletedAt: null
};

describe("payment rules", () => {
  it("handles partial payments", () => {
    const payments = [{ amount: "40000" }];

    expect(totalPaid(payments).toString()).toBe("40000");
    expect(pendingBalance(movement.amount, payments).toString()).toBe("60000");
    expect(statusFromPayments(movement.amount, payments)).toBe("PARTIALLY_PAID");
  });

  it("handles complete payments and real date", () => {
    const paidAt = new Date("2026-06-18T00:00:00.000Z");

    expect(statusFromPayments(movement.amount, [{ amount: "100000" }])).toBe("PAID_OR_COLLECTED");
    expect(nextRealDateAfterPayment({ currentRealDate: null, nextStatus: "PAID_OR_COLLECTED", paidAt })).toBe(paidAt);
  });

  it("rejects excess payments", () => {
    expect(() => validatePaymentAmount({ movement, existingPayments: [{ amount: "90000" }], amount: "10001" })).toThrow("saldo pendiente");
  });

  it("allows several payments up to the pending balance", () => {
    const payments = [{ amount: "25000" }, { amount: "25000" }];
    const amount = validatePaymentAmount({ movement, existingPayments: payments, amount: "50000" });

    expect(amount.toString()).toBe("50000");
    expect(statusFromPayments(movement.amount, [...payments, { amount }])).toBe("PAID_OR_COLLECTED");
  });

  it("ignores annulled payments in totals", () => {
    const payments = [{ amount: "100000", cancelledAt: new Date("2026-06-20T00:00:00.000Z") }];

    expect(totalPaid(payments).toString()).toBe("0");
    expect(statusFromPayments(movement.amount, payments)).toBe("PENDING");
  });

  it("validates permissions", () => {
    expect(() => assertCanRegisterPayment("READ_ONLY")).toThrow("READ_ONLY");
    expect(() => assertCanRegisterPayment("FINANCE")).not.toThrow();
  });

  it("keeps partial status after annulment leaves an active payment", () => {
    const payments = [{ amount: "30000" }, { amount: "70000", cancelledAt: new Date("2026-06-21T00:00:00.000Z") }];

    expect(statusFromPayments(movement.amount, payments)).toBe("PARTIALLY_PAID");
  });

  it("allows paying a foreign-currency movement using its CLP equivalent (projectedAmountClp)", () => {
    const foreignMovement = {
      amount: "1000",
      projectedAmountClp: "950000",
      currency: "USD" as const,
      status: "PENDING" as const,
      cancelledAt: null,
      deletedAt: null
    };

    const amount = validatePaymentAmount({ movement: foreignMovement, existingPayments: [], amount: "950000" });

    expect(amount.toString()).toBe("950000");
    expect(statusFromPayments(foreignMovement.projectedAmountClp, [{ amount }])).toBe("PAID_OR_COLLECTED");
  });
});
