import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  StaticExchangeRateProvider,
  resolveConversion,
  resolveConversionAllowManualFallback,
  shouldPreserveHistoricalRate
} from "./exchange-rates";

const date = new Date("2026-06-18T00:00:00.000Z");

describe("exchange conversion", () => {
  it("uses rate 1 for CLP", async () => {
    const result = await resolveConversion({ amount: "1234", currency: "CLP", date, provider: new StaticExchangeRateProvider() });

    expect(result.projectedRate.toString()).toBe("1");
    expect(result.projectedAmountClp.toString()).toBe("1234");
  });

  it("converts UF", async () => {
    const result = await resolveConversion({
      amount: "2",
      currency: "UF",
      date,
      provider: new StaticExchangeRateProvider({ UF: "38000" })
    });

    expect(result.projectedAmountClp.toString()).toBe("76000");
  });

  it("converts EUR", async () => {
    const result = await resolveConversion({
      amount: "10",
      currency: "EUR",
      date,
      provider: new StaticExchangeRateProvider({ EUR: "1000.50" })
    });

    expect(result.projectedAmountClp.toString()).toBe("10005");
  });

  it("converts USD", async () => {
    const result = await resolveConversion({
      amount: "10",
      currency: "USD",
      date,
      provider: new StaticExchangeRateProvider({ USD: "900" })
    });

    expect(result.projectedAmountClp.toString()).toBe("9000");
  });

  it("allows manual correction", async () => {
    const result = await resolveConversion({
      amount: "10",
      currency: "USD",
      date,
      manualRate: "950",
      manualReason: "Banco observado",
      provider: new StaticExchangeRateProvider({ USD: "900" })
    });

    expect(result.isManualRate).toBe(true);
    expect(result.projectedAmountClp.toString()).toBe("9500");
    expect(result.manualRateReason).toBe("Banco observado");
  });

  it("allows manual entry when automatic lookup fails", async () => {
    const result = await resolveConversionAllowManualFallback({
      amount: "3",
      currency: "EUR",
      date,
      manualRate: "1100",
      preferAutomatic: true,
      provider: new StaticExchangeRateProvider()
    });

    expect(result.exchangeRateSource).toBe("manual-fallback");
    expect(result.projectedAmountClp.toString()).toBe("3300");
  });

  it("preserves historical rates", () => {
    const existing = {
      projectedRate: new Prisma.Decimal("900"),
      projectedAmountClp: new Prisma.Decimal("9000")
    };

    expect(shouldPreserveHistoricalRate(existing)).toEqual(existing);
  });
});
