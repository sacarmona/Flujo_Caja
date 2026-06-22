import { describe, expect, it } from "vitest";
import { movementAuditSummary } from "./audit-log";

describe("movementAuditSummary", () => {
  it("usa after cuando esta disponible", () => {
    const summary = movementAuditSummary({
      before: { description: "Antiguo", amount: "1000", type: "EXPENSE", projectedDate: "2026-01-01T00:00:00.000Z" },
      after: { description: "Arriendo oficina", amount: "450000", type: "EXPENSE", projectedDate: "2026-06-05T00:00:00.000Z" }
    });

    expect(summary.description).toBe("Arriendo oficina");
    expect(summary.amount).toBe(450000);
    expect(summary.type).toBe("EXPENSE");
    expect(summary.projectedDate?.toISOString()).toBe("2026-06-05T00:00:00.000Z");
  });

  it("usa before cuando after no existe", () => {
    const summary = movementAuditSummary({
      before: { description: "Pago proveedor", amount: "120000", type: "EXPENSE", projectedDate: "2026-03-10T00:00:00.000Z" },
      after: null
    });

    expect(summary.description).toBe("Pago proveedor");
    expect(summary.amount).toBe(120000);
    expect(summary.type).toBe("EXPENSE");
    expect(summary.projectedDate?.toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });

  it("devuelve valores por defecto cuando no hay datos", () => {
    expect(movementAuditSummary({ before: null, after: null })).toEqual({
      description: "(sin datos)",
      amount: null,
      type: null,
      projectedDate: null
    });
  });

  it("identifica el ajuste de tasa manual en vez de mostrar (sin descripcion)", () => {
    const summary = movementAuditSummary({
      before: null,
      after: {
        conversionDate: "2026-06-10T00:00:00.000Z",
        projectedRate: "950",
        projectedAmountClp: "950000",
        exchangeRateSource: "manual-fallback",
        isManualRate: true,
        manualRateReason: "Consulta automatica fallida"
      }
    });

    expect(summary.description).toBe("Ajuste de tasa de cambio manual");
    expect(summary.amount).toBeNull();
    expect(summary.projectedDate).toBeNull();
  });
});
