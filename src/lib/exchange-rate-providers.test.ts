import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CachedHttpExchangeRateProvider } from "./exchange-rate-providers";

function fakePrisma(overrides: { findFirst?: unknown; upsert?: unknown } = {}) {
  return {
    exchangeRate: {
      findFirst: vi.fn().mockResolvedValue(overrides.findFirst ?? null),
      upsert: vi.fn().mockResolvedValue(overrides.upsert)
    }
  } as unknown as ConstructorParameters<typeof CachedHttpExchangeRateProvider>[0];
}

describe("CachedHttpExchangeRateProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.EXCHANGE_RATE_API_URL = "https://mindicador.cl/api";
    process.env.EXCHANGE_RATE_API_TIMEOUT_MS = "5000";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("CLP siempre devuelve tasa 1 sin consultar cache ni la API", async () => {
    const prisma = fakePrisma();
    const provider = new CachedHttpExchangeRateProvider(prisma, "company-1");

    const result = await provider.getRate("CLP", new Date(2026, 5, 20));

    expect(result.rate.toString()).toBe("1");
    expect(result.source).toBe("CLP");
    expect(prisma.exchangeRate.findFirst).not.toHaveBeenCalled();
  });

  it("usa la tasa cacheada en ExchangeRate si existe para esa fecha", async () => {
    const prisma = fakePrisma({ findFirst: { rate: new Prisma.Decimal("950.5"), source: "mindicador.cl" } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = new CachedHttpExchangeRateProvider(prisma, "company-1");

    const result = await provider.getRate("USD", new Date(2026, 5, 20));

    expect(result.rate.toString()).toBe("950.5");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("consulta mindicador.cl cuando no hay tasa cacheada y guarda el resultado", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ serie: [{ valor: 38500.75 }] })
    });
    vi.stubGlobal("fetch", fetchMock);
    const prisma = fakePrisma({ upsert: { rate: new Prisma.Decimal("38500.75"), source: "mindicador.cl" } });
    const provider = new CachedHttpExchangeRateProvider(prisma, "company-1");

    const result = await provider.getRate("UF", new Date(2026, 5, 20));

    expect(fetchMock).toHaveBeenCalledWith("https://mindicador.cl/api/uf/20-06-2026", expect.anything());
    expect(result.rate.toString()).toBe("38500.75");
    expect(result.source).toBe("mindicador.cl");
    expect(prisma.exchangeRate.upsert).toHaveBeenCalled();
  });

  it("propaga el error cuando mindicador.cl responde con error, para permitir caer a una tasa manual", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const prisma = fakePrisma();
    const provider = new CachedHttpExchangeRateProvider(prisma, "company-1");

    await expect(provider.getRate("EUR", new Date(2026, 5, 20))).rejects.toThrow("mindicador.cl respondio 500");
  });

  it("propaga el error cuando la respuesta no trae un valor numerico valido", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ serie: [] }) }));
    const prisma = fakePrisma();
    const provider = new CachedHttpExchangeRateProvider(prisma, "company-1");

    await expect(provider.getRate("USD", new Date(2026, 5, 20))).rejects.toThrow("no tiene dato");
  });
});
