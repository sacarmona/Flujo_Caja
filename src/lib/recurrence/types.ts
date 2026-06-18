export type RecurrenceFrequency =
  | "DAILY"
  | "EVERY_N_DAYS"
  | "BUSINESS_DAYS"
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMIANNUAL"
  | "ANNUAL";

export interface RecurrenceConfig {
  ruleId: string;
  startDate: Date;
  endDate?: Date;
  frequency: RecurrenceFrequency;
  /** Paso numérico para DAILY/EVERY_N_DAYS/WEEKLY/BIWEEKLY/MONTHLY/etc. Por defecto 1. */
  interval?: number;
  /** Días ISO de la semana (1=lunes..7=domingo) usados por WEEKLY. */
  weekDays?: number[];
  /** Día del mes (1-31) usado por MONTHLY/QUARTERLY/SEMIANNUAL/ANNUAL. Si no existe en el mes, se usa el último día. */
  dayOfMonth?: number;
  baseAmount: number;
}

export type OccurrenceOverrideMode = "SINGLE" | "FORWARD";

export interface OccurrenceOverride {
  /** Fecha teórica (sin ajustar) de la ocurrencia que dispara el override. */
  rawDate: Date;
  mode: OccurrenceOverrideMode;
  amount?: number;
  accountId?: string;
  description?: string;
}

export interface RecurrenceOccurrenceResult {
  idempotencyKey: string;
  rawDate: Date;
  scheduledDate: Date;
  baseAmount: number;
  computedAmount: number;
  manualAdjustment: number;
  finalAmount: number;
}
