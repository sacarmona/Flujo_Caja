import { Prisma } from "@prisma/client";
import type { Currency, PrismaClient } from "@prisma/client";
import type { ExchangeRateProvider, ExchangeRateResult } from "./exchange-rates";

type ExchangeRateClient = Pick<PrismaClient, "exchangeRate"> | Prisma.TransactionClient;

const mindicadorIndicatorByCurrency: Partial<Record<Currency, string>> = {
  USD: "dolar",
  EUR: "euro",
  UF: "uf"
};

function formatMindicadorDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
}

async function fetchMindicadorRate(currency: Currency, date: Date): Promise<Prisma.Decimal> {
  const indicator = mindicadorIndicatorByCurrency[currency];
  if (!indicator) {
    throw new Error(`mindicador.cl no provee tasa para ${currency}.`);
  }

  const baseUrl = process.env.EXCHANGE_RATE_API_URL;
  if (!baseUrl) {
    throw new Error("EXCHANGE_RATE_API_URL no esta configurada.");
  }

  const timeoutMs = Number(process.env.EXCHANGE_RATE_API_TIMEOUT_MS ?? "5000");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/${indicator}/${formatMindicadorDate(date)}`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`mindicador.cl respondio ${response.status} para ${currency}.`);
    }

    const body = (await response.json()) as { serie?: Array<{ valor?: unknown }> };
    const value = body.serie?.[0]?.valor;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`mindicador.cl no tiene dato de ${currency} para esa fecha.`);
    }

    return new Prisma.Decimal(value);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`mindicador.cl no respondio dentro de ${timeoutMs}ms para ${currency}.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Busca primero en ExchangeRate (cache local); si no hay dato para esa fecha,
 * consulta mindicador.cl (UF/USD/EUR, ver EXCHANGE_RATE_API_URL) y guarda el
 * resultado para no repetir la consulta. Si la consulta falla (API caida,
 * timeout, sin dato para esa fecha), propaga el error para que quien llama
 * (resolveConversionAllowManualFallback) pueda caer a una tasa manual.
 */
export class CachedHttpExchangeRateProvider implements ExchangeRateProvider {
  constructor(
    private readonly prisma: ExchangeRateClient,
    private readonly companyId: string
  ) {}

  async getRate(currency: Currency, date: Date): Promise<ExchangeRateResult> {
    if (currency === "CLP") {
      return { currency, date, rate: new Prisma.Decimal(1), source: "CLP" };
    }

    const rateDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const end = new Date(rateDate.getFullYear(), rateDate.getMonth(), rateDate.getDate(), 23, 59, 59, 999);

    const cached = await this.prisma.exchangeRate.findFirst({
      where: {
        companyId: this.companyId,
        fromCurrency: currency,
        toCurrency: "CLP",
        rateDate: { gte: rateDate, lte: end },
        deletedAt: null
      },
      orderBy: { createdAt: "desc" }
    });

    if (cached) {
      return { currency, date, rate: cached.rate, source: cached.source ?? "ExchangeRate" };
    }

    const rate = await fetchMindicadorRate(currency, rateDate);
    const saved = await this.prisma.exchangeRate.upsert({
      where: {
        companyId_fromCurrency_toCurrency_rateDate: {
          companyId: this.companyId,
          fromCurrency: currency,
          toCurrency: "CLP",
          rateDate
        }
      },
      create: { companyId: this.companyId, fromCurrency: currency, toCurrency: "CLP", rate, rateDate, source: "mindicador.cl" },
      update: { rate, source: "mindicador.cl" }
    });

    return { currency, date, rate: saved.rate, source: saved.source ?? "mindicador.cl" };
  }
}
