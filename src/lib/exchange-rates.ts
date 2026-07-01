import { Prisma } from "@prisma/client";
import type { Currency } from "@prisma/client";
import { decimal } from "./payments";

export type ExchangeRateResult = {
  currency: Currency;
  date: Date;
  rate: Prisma.Decimal;
  source: string;
};

export interface ExchangeRateProvider {
  getRate(currency: Currency, date: Date): Promise<ExchangeRateResult>;
}

export class StaticExchangeRateProvider implements ExchangeRateProvider {
  constructor(private readonly rates: Partial<Record<Currency, string>> = {}) {}

  async getRate(currency: Currency, date: Date): Promise<ExchangeRateResult> {
    if (currency === "CLP") {
      return { currency, date, rate: new Prisma.Decimal(1), source: "CLP" };
    }

    const rate = this.rates[currency];

    if (!rate) {
      throw new Error(`No hay tasa disponible para ${currency}.`);
    }

    return { currency, date, rate: new Prisma.Decimal(rate), source: "static-provider" };
  }
}

export type ConversionInput = {
  amount: Prisma.Decimal | number | string;
  currency: Currency;
  date: Date;
  manualRate?: string | null;
  manualReason?: string | null;
  preferAutomatic?: boolean;
  provider: ExchangeRateProvider;
};

export type ConversionResult = {
  conversionDate: Date;
  projectedRate: Prisma.Decimal;
  projectedAmountClp: Prisma.Decimal;
  exchangeRateSource: string;
  isManualRate: boolean;
  manualRateReason: string | null;
};

function positiveRate(value: string): Prisma.Decimal {
  const rate = new Prisma.Decimal(value.replace(",", "."));

  if (!rate.isFinite() || rate.lte(0)) {
    throw new Error("La tasa de conversion debe ser positiva.");
  }

  return rate;
}

/**
 * Se conserva el decimal resultante de aplicar la tasa de cambio (no se
 * redondea a entero aqui): redondear cada movimiento por separado antes de
 * sumarlos en una conciliacion dividida acumula error y la suma final puede
 * no calzar con el monto entero de la cartola. El redondeo a entero se
 * aplica solo una vez, sobre la suma final, al comparar contra la cartola
 * (ver validateSplitAllocations en reconciliation.ts).
 */
export function clpAmount(amount: Prisma.Decimal | number | string, rate: Prisma.Decimal): Prisma.Decimal {
  return decimal(amount).mul(rate).toDecimalPlaces(2);
}

export async function resolveConversion(input: ConversionInput): Promise<ConversionResult> {
  if (input.currency === "CLP") {
    return {
      conversionDate: input.date,
      projectedRate: new Prisma.Decimal(1),
      projectedAmountClp: clpAmount(input.amount, new Prisma.Decimal(1)),
      exchangeRateSource: "CLP",
      isManualRate: false,
      manualRateReason: null
    };
  }

  if (input.manualRate) {
    const rate = positiveRate(input.manualRate);
    return {
      conversionDate: input.date,
      projectedRate: rate,
      projectedAmountClp: clpAmount(input.amount, rate),
      exchangeRateSource: "manual",
      isManualRate: true,
      manualRateReason: input.manualReason?.trim() || "Correccion manual"
    };
  }

  const result = await input.provider.getRate(input.currency, input.date);

  return {
    conversionDate: input.date,
    projectedRate: result.rate,
    projectedAmountClp: clpAmount(input.amount, result.rate),
    exchangeRateSource: result.source,
    isManualRate: false,
    manualRateReason: null
  };
}

export async function resolveConversionAllowManualFallback(input: ConversionInput): Promise<ConversionResult> {
  if (input.currency === "CLP") {
    return resolveConversion(input);
  }

  if (!input.preferAutomatic && input.manualRate) {
    return resolveConversion(input);
  }

  try {
    return await resolveConversion({ ...input, manualRate: null, manualReason: null });
  } catch (error) {
    if (input.manualRate) {
      const rate = positiveRate(input.manualRate);
      return {
        conversionDate: input.date,
        projectedRate: rate,
        projectedAmountClp: clpAmount(input.amount, rate),
        exchangeRateSource: "manual-fallback",
        isManualRate: true,
        manualRateReason: input.manualReason?.trim() || `Consulta automatica fallida: ${(error as Error).message}`
      };
    }

    throw error;
  }
}

export function shouldPreserveHistoricalRate(existing: { projectedRate: Prisma.Decimal; projectedAmountClp: Prisma.Decimal }) {
  return {
    projectedRate: existing.projectedRate,
    projectedAmountClp: existing.projectedAmountClp
  };
}
