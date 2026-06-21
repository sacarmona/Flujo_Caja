import { describe, expect, it } from "vitest";
import { balanceByWeekKey, groupByWeek, weekKeyOf } from "./shared";

describe("groupByWeek / weekKeyOf", () => {
  it("agrupa por semana ISO y la clave coincide con weekKeyOf", () => {
    // 19-jun-2026 (viernes, semana 25), 20-jun (mismo viernes a sabado, sigue semana 25), 22-jun (lunes, semana 26).
    const items = [{ date: new Date(2026, 5, 19) }, { date: new Date(2026, 5, 20) }, { date: new Date(2026, 5, 22) }];
    const groups = groupByWeek(items, (item) => item.date);

    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe(weekKeyOf(items[0].date));
    expect(groups[1].key).toBe(weekKeyOf(items[2].date));
  });
});

describe("balanceByWeekKey", () => {
  it("acumula ingresos en positivo y egresos en negativo, ordenando por fecha", () => {
    const balances = balanceByWeekKey([
      { type: "INCOME", status: "PAID_OR_COLLECTED", projectedDate: new Date(2026, 5, 22), projectedAmountClp: "1000" },
      { type: "EXPENSE", status: "PROJECTED", projectedDate: new Date(2026, 5, 19), projectedAmountClp: "300" },
      { type: "INCOME", status: "PROJECTED", projectedDate: new Date(2026, 5, 29), projectedAmountClp: "500" }
    ]);

    expect(balances.get(weekKeyOf(new Date(2026, 5, 19)))?.toString()).toBe("-300");
    expect(balances.get(weekKeyOf(new Date(2026, 5, 22)))?.toString()).toBe("700");
    expect(balances.get(weekKeyOf(new Date(2026, 5, 29)))?.toString()).toBe("1200");
  });

  it("ignora movimientos cancelados", () => {
    const balances = balanceByWeekKey([
      { type: "INCOME", status: "CANCELLED", projectedDate: new Date(2026, 5, 19), projectedAmountClp: "1000" },
      { type: "EXPENSE", status: "PROJECTED", projectedDate: new Date(2026, 5, 19), projectedAmountClp: "200" }
    ]);

    expect(balances.get(weekKeyOf(new Date(2026, 5, 19)))?.toString()).toBe("-200");
  });
});
