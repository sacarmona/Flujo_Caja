import { describe, expect, it } from "vitest";
import { calculateCashFlowByBusinessDay, businessDaysBetween } from "./cash-flow";

const accountParent = { id: "cat-income", name: "Ingresos" };
const incomeAccount = { id: "acc-income", code: "1.01", name: "Servicios de inspección", parent: accountParent };
const expenseAccount = { id: "acc-expense", code: "3.05", name: "Software y licencias", parent: { id: "cat-admin", name: "Gastos administrativos" } };
const unitOps = { id: "unit-ops", name: "Inspecciones" };
const unitAdmin = { id: "unit-admin", name: "Casa Matriz" };

function date(value: string) {
  return new Date(`${value}T00:00:00.000`);
}

const openingBalances = [{ amount: "1000000", balanceDate: date("2026-06-01"), deletedAt: null }];

const baseMovement = {
  status: "PENDING" as const,
  currency: "CLP" as const,
  deletedAt: null,
  cancelledAt: null,
  payments: []
};

describe("cash flow business-day service", () => {
  it("calculates opening balance, daily net flow and accumulated balance", () => {
    const result = calculateCashFlowByBusinessDay(
      [
        {
          ...baseMovement,
          id: "income",
          type: "INCOME" as const,
          projectedDate: date("2026-06-15"),
          projectedAmountClp: "200000",
          accountingAccountId: incomeAccount.id,
          businessUnitId: unitOps.id,
          accountingAccount: incomeAccount,
          businessUnit: unitOps
        },
        {
          ...baseMovement,
          id: "expense",
          type: "EXPENSE" as const,
          projectedDate: date("2026-06-15"),
          projectedAmountClp: "50000",
          accountingAccountId: expenseAccount.id,
          businessUnitId: unitAdmin.id,
          accountingAccount: expenseAccount,
          businessUnit: unitAdmin
        }
      ],
      openingBalances,
      { startDate: date("2026-06-15"), endDate: date("2026-06-15") }
    );

    expect(result.openingBalance.toString()).toBe("1000000");
    expect(result.days[0].pendingIncome.toString()).toBe("200000");
    expect(result.days[0].pendingExpense.toString()).toBe("50000");
    expect(result.days[0].netFlow.toString()).toBe("150000");
    expect(result.days[0].accumulatedBalance.toString()).toBe("1150000");
  });

  it("uses real CLP payments for partially paid movements and avoids double counting projection", () => {
    const result = calculateCashFlowByBusinessDay(
      [
        {
          ...baseMovement,
          id: "partial",
          type: "INCOME" as const,
          status: "PARTIALLY_PAID" as const,
          projectedDate: date("2026-06-15"),
          projectedAmountClp: "200000",
          accountingAccountId: incomeAccount.id,
          businessUnitId: unitOps.id,
          accountingAccount: incomeAccount,
          businessUnit: unitOps,
          payments: [{ id: "pay-1", amount: "80000", paidAt: date("2026-06-16"), currency: "CLP" as const }]
        }
      ],
      openingBalances,
      { startDate: date("2026-06-15"), endDate: date("2026-06-16") }
    );

    expect(result.days.find((day) => day.date.getDate() === 15)?.projectedIncome.toString()).toBe("0");
    expect(result.days.find((day) => day.date.getDate() === 16)?.realIncome.toString()).toBe("80000");
  });

  it("keeps movements still Proyectado out of the real total", () => {
    const result = calculateCashFlowByBusinessDay(
      [
        {
          ...baseMovement,
          id: "projected",
          type: "EXPENSE" as const,
          status: "PROJECTED" as const,
          projectedDate: date("2026-06-17"),
          projectedAmountClp: "30000",
          accountingAccountId: expenseAccount.id,
          businessUnitId: unitAdmin.id,
          accountingAccount: expenseAccount,
          businessUnit: unitAdmin
        }
      ],
      openingBalances,
      { startDate: date("2026-06-17"), endDate: date("2026-06-17") }
    );

    expect(result.days[0].projectedExpense.toString()).toBe("30000");
    expect(result.days[0].realExpense.toString()).toBe("0");
    expect(result.days[0].fullProjectedExpense.toString()).toBe("30000");
  });

  it("incluye en fullProjected a todos los estados salvo Cancelado, en la fecha proyectada original", () => {
    const result = calculateCashFlowByBusinessDay(
      [
        {
          ...baseMovement,
          id: "overdue",
          type: "EXPENSE" as const,
          status: "OVERDUE" as const,
          projectedDate: date("2026-06-17"),
          projectedAmountClp: "10000",
          accountingAccountId: expenseAccount.id,
          businessUnitId: unitAdmin.id,
          accountingAccount: expenseAccount,
          businessUnit: unitAdmin
        },
        {
          ...baseMovement,
          id: "paid-other-date",
          type: "EXPENSE" as const,
          status: "PAID_OR_COLLECTED" as const,
          projectedDate: date("2026-06-17"),
          projectedAmountClp: "20000",
          accountingAccountId: expenseAccount.id,
          businessUnitId: unitAdmin.id,
          accountingAccount: expenseAccount,
          businessUnit: unitAdmin,
          payments: [{ id: "pay-3", amount: "20000", paidAt: date("2026-06-18"), currency: "CLP" as const }]
        },
        {
          ...baseMovement,
          id: "cancelled",
          type: "EXPENSE" as const,
          status: "CANCELLED" as const,
          cancelledAt: date("2026-06-16"),
          projectedDate: date("2026-06-17"),
          projectedAmountClp: "99999",
          accountingAccountId: expenseAccount.id,
          businessUnitId: unitAdmin.id,
          accountingAccount: expenseAccount,
          businessUnit: unitAdmin
        }
      ],
      openingBalances,
      { startDate: date("2026-06-17"), endDate: date("2026-06-18") }
    );

    // El pago se registra en la fecha real (18), pero el fullProjected del
    // monto pagado se queda en la fecha proyectada original (17), porque
    // representa el plan original, no lo efectivamente cobrado/pagado.
    expect(result.days[0].fullProjectedExpense.toString()).toBe("30000");
    expect(result.days[1].fullProjectedExpense.toString()).toBe("0");
  });

  it("counts Pendiente movements without payment as real, using el monto y fecha proyectados", () => {
    const result = calculateCashFlowByBusinessDay(
      [
        {
          ...baseMovement,
          id: "pending",
          type: "EXPENSE" as const,
          status: "PENDING" as const,
          projectedDate: date("2026-06-17"),
          projectedAmountClp: "30000",
          accountingAccountId: expenseAccount.id,
          businessUnitId: unitAdmin.id,
          accountingAccount: expenseAccount,
          businessUnit: unitAdmin
        },
        {
          ...baseMovement,
          id: "paid",
          type: "EXPENSE" as const,
          status: "PAID_OR_COLLECTED" as const,
          projectedDate: date("2026-06-17"),
          projectedAmountClp: "50000",
          accountingAccountId: expenseAccount.id,
          businessUnitId: unitAdmin.id,
          accountingAccount: expenseAccount,
          businessUnit: unitAdmin,
          payments: [{ id: "pay-2", amount: "50000", paidAt: date("2026-06-18"), currency: "CLP" as const }]
        }
      ],
      openingBalances,
      { startDate: date("2026-06-17"), endDate: date("2026-06-18") }
    );

    expect(result.days[0].projectedExpense.toString()).toBe("0");
    expect(result.days[0].pendingExpense.toString()).toBe("30000");
    expect(result.days[0].realExpense.toString()).toBe("0");
    expect(result.days[0].fullProjectedExpense.toString()).toBe("80000");
    expect(result.days[1].pendingExpense.toString()).toBe("50000");
    expect(result.days[1].realExpense.toString()).toBe("50000");
  });

  it("Pendiente cuenta para Modo Pendiente pero no para Modo Real (solo Parcial/Pagado)", () => {
    const result = calculateCashFlowByBusinessDay(
      [
        {
          ...baseMovement,
          id: "pending-only",
          type: "EXPENSE" as const,
          status: "PENDING" as const,
          projectedDate: date("2026-06-17"),
          projectedAmountClp: "30000",
          accountingAccountId: expenseAccount.id,
          businessUnitId: unitAdmin.id,
          accountingAccount: expenseAccount,
          businessUnit: unitAdmin
        },
        {
          ...baseMovement,
          id: "partially-paid",
          type: "EXPENSE" as const,
          status: "PARTIALLY_PAID" as const,
          projectedDate: date("2026-06-17"),
          projectedAmountClp: "100000",
          accountingAccountId: expenseAccount.id,
          businessUnitId: unitAdmin.id,
          accountingAccount: expenseAccount,
          businessUnit: unitAdmin,
          payments: [{ id: "pay-partial", amount: "40000", paidAt: date("2026-06-17"), currency: "CLP" as const }]
        }
      ],
      openingBalances,
      { startDate: date("2026-06-17"), endDate: date("2026-06-17") }
    );

    expect(result.days[0].pendingExpense.toString()).toBe("70000");
    expect(result.days[0].realExpense.toString()).toBe("40000");
  });

  it("pone al dia el saldo inicial con lo Real cobrado/pagado de una semana que ya no esta en el rango visible", () => {
    const result = calculateCashFlowByBusinessDay(
      [
        {
          ...baseMovement,
          id: "paid-last-week",
          type: "INCOME" as const,
          status: "PAID_OR_COLLECTED" as const,
          projectedDate: date("2026-06-17"),
          projectedAmountClp: "300000",
          accountingAccountId: incomeAccount.id,
          businessUnitId: unitOps.id,
          accountingAccount: incomeAccount,
          businessUnit: unitOps,
          payments: [{ id: "pay-last-week", amount: "300000", paidAt: date("2026-06-18"), currency: "CLP" as const }]
        },
        {
          ...baseMovement,
          id: "paid-expense-last-week",
          type: "EXPENSE" as const,
          status: "PAID_OR_COLLECTED" as const,
          projectedDate: date("2026-06-19"),
          projectedAmountClp: "50000",
          accountingAccountId: expenseAccount.id,
          businessUnitId: unitAdmin.id,
          accountingAccount: expenseAccount,
          businessUnit: unitAdmin,
          payments: [{ id: "pay-expense-last-week", amount: "50000", paidAt: date("2026-06-19"), currency: "CLP" as const }]
        },
        {
          ...baseMovement,
          id: "still-pending-last-week",
          type: "INCOME" as const,
          status: "PENDING" as const,
          projectedDate: date("2026-06-18"),
          projectedAmountClp: "999999",
          accountingAccountId: incomeAccount.id,
          businessUnitId: unitOps.id,
          accountingAccount: incomeAccount,
          businessUnit: unitOps
        }
      ],
      [{ amount: "1000000", balanceDate: date("2026-06-15"), deletedAt: null }],
      { startDate: date("2026-06-22"), endDate: date("2026-06-22") }
    );

    // 1000000 (confirmado el 15-jun) + 300000 cobrado el 18 - 50000 pagado el 19 = 1250000.
    // El Pendiente de 999999 (still-pending-last-week) no se suma: nunca se cobro.
    expect(result.openingBalance.toString()).toBe("1250000");
  });

  it("usa por defecto el saldo calculado entre semanas, pero respeta un saldo confirmado/actualizado a mitad de rango", () => {
    const result = calculateCashFlowByBusinessDay(
      [],
      [
        { amount: "1000000", balanceDate: date("2026-06-01"), deletedAt: null },
        { amount: "500000", balanceDate: date("2026-06-17"), deletedAt: null }
      ],
      { startDate: date("2026-06-15"), endDate: date("2026-06-19") }
    );

    expect(result.days.find((day) => day.date.getDate() === 15)?.accumulatedBalance.toString()).toBe("1000000");
    expect(result.days.find((day) => day.date.getDate() === 16)?.accumulatedBalance.toString()).toBe("1000000");
    expect(result.days.find((day) => day.date.getDate() === 17)?.accumulatedBalance.toString()).toBe("500000");
    expect(result.days.find((day) => day.date.getDate() === 19)?.accumulatedBalance.toString()).toBe("500000");
  });

  it("excluye Vencido del total real", () => {
    const result = calculateCashFlowByBusinessDay(
      [
        {
          ...baseMovement,
          id: "overdue",
          type: "EXPENSE" as const,
          status: "OVERDUE" as const,
          projectedDate: date("2026-06-17"),
          projectedAmountClp: "15000",
          accountingAccountId: expenseAccount.id,
          businessUnitId: unitAdmin.id,
          accountingAccount: expenseAccount,
          businessUnit: unitAdmin
        }
      ],
      openingBalances,
      { startDate: date("2026-06-17"), endDate: date("2026-06-17") }
    );

    expect(result.days[0].projectedExpense.toString()).toBe("15000");
    expect(result.days[0].realExpense.toString()).toBe("0");
  });

  it("groups by category, account and business unit", () => {
    const result = calculateCashFlowByBusinessDay(
      [
        {
          ...baseMovement,
          id: "grouped",
          type: "INCOME" as const,
          status: "PROJECTED" as const,
          projectedDate: date("2026-06-15"),
          projectedAmountClp: "123000",
          accountingAccountId: incomeAccount.id,
          businessUnitId: unitOps.id,
          accountingAccount: incomeAccount,
          businessUnit: unitOps
        }
      ],
      openingBalances,
      { startDate: date("2026-06-15"), endDate: date("2026-06-15") }
    );

    expect(result.days[0].byCategory.Ingresos.projectedIncome.toString()).toBe("123000");
    expect(result.days[0].byAccountingAccount["Servicios de inspección"].projectedIncome.toString()).toBe("123000");
    expect(result.days[0].byBusinessUnit.Inspecciones.projectedIncome.toString()).toBe("123000");
  });

  it("applies filters by business unit, account, status, type and currency", () => {
    const movements = [
      {
        ...baseMovement,
        id: "included",
        type: "INCOME" as const,
        status: "PENDING" as const,
        currency: "USD" as const,
        projectedDate: date("2026-06-15"),
        projectedAmountClp: "90000",
        accountingAccountId: incomeAccount.id,
        businessUnitId: unitOps.id,
        accountingAccount: incomeAccount,
        businessUnit: unitOps
      },
      {
        ...baseMovement,
        id: "excluded",
        type: "EXPENSE" as const,
        status: "PENDING" as const,
        currency: "CLP" as const,
        projectedDate: date("2026-06-15"),
        projectedAmountClp: "90000",
        accountingAccountId: expenseAccount.id,
        businessUnitId: unitAdmin.id,
        accountingAccount: expenseAccount,
        businessUnit: unitAdmin
      }
    ];
    const result = calculateCashFlowByBusinessDay(movements, openingBalances, {
      startDate: date("2026-06-15"),
      endDate: date("2026-06-15"),
      filters: {
        businessUnitId: unitOps.id,
        accountingAccountId: incomeAccount.id,
        status: "PENDING",
        type: "INCOME",
        currency: "USD"
      }
    });

    expect(result.days[0].pendingIncome.toString()).toBe("90000");
    expect(result.days[0].realExpense.toString()).toBe("0");
  });

  it("calculates weekly totals with Monday week start", () => {
    const result = calculateCashFlowByBusinessDay(
      [
        {
          ...baseMovement,
          id: "monday",
          type: "INCOME" as const,
          projectedDate: date("2026-06-15"),
          projectedAmountClp: "10000",
          accountingAccountId: incomeAccount.id,
          businessUnitId: unitOps.id,
          accountingAccount: incomeAccount,
          businessUnit: unitOps
        },
        {
          ...baseMovement,
          id: "friday",
          type: "EXPENSE" as const,
          projectedDate: date("2026-06-19"),
          projectedAmountClp: "3000",
          accountingAccountId: expenseAccount.id,
          businessUnitId: unitAdmin.id,
          accountingAccount: expenseAccount,
          businessUnit: unitAdmin
        }
      ],
      openingBalances,
      { startDate: date("2026-06-15"), endDate: date("2026-06-19") }
    );

    expect(result.weeks).toHaveLength(1);
    expect(result.weeks[0].weekStart.getDay()).toBe(1);
    expect(result.weeks[0].netFlow.toString()).toBe("7000");
  });

  it("uses business days only and moves weekend payments to next business day", () => {
    const result = calculateCashFlowByBusinessDay(
      [
        {
          ...baseMovement,
          id: "weekend-payment",
          type: "INCOME" as const,
          status: "PAID_OR_COLLECTED" as const,
          projectedDate: date("2026-06-19"),
          projectedAmountClp: "100000",
          accountingAccountId: incomeAccount.id,
          businessUnitId: unitOps.id,
          accountingAccount: incomeAccount,
          businessUnit: unitOps,
          payments: [{ id: "pay-weekend", amount: "100000", paidAt: date("2026-06-20"), currency: "CLP" as const }]
        }
      ],
      openingBalances,
      { startDate: date("2026-06-19"), endDate: date("2026-06-22") }
    );

    expect(result.days.map((day) => day.date.getDay())).toEqual([5, 1]);
    expect(result.days[1].realIncome.toString()).toBe("100000");
  });

  it("limits generated horizon to 12 months", () => {
    const days = businessDaysBetween(date("2026-01-01"), date("2027-06-01"));
    const result = calculateCashFlowByBusinessDay([], openingBalances, {
      startDate: date("2026-01-01"),
      endDate: date("2027-06-01")
    });

    expect(result.days.length).toBeLessThan(days.length);
    const lastDay = result.days.at(-1);
    if (!lastDay) {
      throw new Error("Expected at least one business day");
    }
    expect(lastDay.date <= date("2027-01-01")).toBe(true);
  });
});
