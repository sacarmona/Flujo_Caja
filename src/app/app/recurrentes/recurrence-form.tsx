"use client";

import { useState } from "react";
import type { AccountingAccountType, MovementStatus, MovementType, RecurrenceFrequency } from "@prisma/client";
import { AmountInput } from "@/components/amount-input";
import { accountMatchesMovementType, movementCurrencies, movementStatuses, movementTypes } from "@/lib/movements";
import { monthlyDayFrequencies, recurrenceAmountToString, recurrenceFrequencies, weeklyDayFrequencies } from "@/lib/recurrence-rules";

const typeLabels: Record<MovementType, string> = {
  INCOME: "Ingreso",
  EXPENSE: "Egreso"
};

const statusLabels: Record<MovementStatus, string> = {
  PROJECTED: "Proyectado",
  PENDING: "Pendiente",
  PARTIALLY_PAID: "Parcial",
  PAID_OR_COLLECTED: "Pagado/Cobrado",
  OVERDUE: "Vencido",
  CANCELLED: "Cancelado"
};

const frequencyLabels: Record<RecurrenceFrequency, string> = {
  DAILY: "Diaria",
  BUSINESS_DAYS: "Dias habiles",
  EVERY_N_DAYS: "Cada N dias",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
  QUARTERLY: "Trimestral",
  SEMIANNUAL: "Semestral",
  ANNUAL: "Anual"
};

function dateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function optionLabel(code: string | null | undefined, name: string) {
  return code ? `${code} - ${name}` : name;
}

function SelectOptions<T extends string>({ labels, values }: { labels: Record<T, string>; values: readonly T[] }) {
  return values.map((value) => (
    <option key={value} value={value}>
      {labels[value]}
    </option>
  ));
}

type ReferenceData = {
  accounts: { id: string; code: string | null; name: string; type: AccountingAccountType }[];
  bankAccounts: { id: string; name: string }[];
  businessUnits: { id: string; name: string }[];
  costCenters: { id: string; code: string | null; name: string }[];
  projects: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
};

/** Solo strings/numeros/fechas planos: RecurrenceRule viene de un Server Component y sus campos Decimal no son serializables hacia un Client Component. */
type RecurrenceLike = {
  accountingAccountId: string;
  amount: string;
  bankAccountId: string;
  businessUnitId: string;
  costCenterId: string | null;
  currency: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  description: string;
  endDate: Date | null;
  frequency: RecurrenceFrequency;
  id: string;
  intervalDays: number | null;
  manualRate: string | null;
  manualRateReason: string | null;
  notes: string | null;
  projectId: string | null;
  vendorId: string | null;
  startDate: Date;
  status: MovementStatus;
  type: MovementType;
};

export function RecurrenceForm({
  action,
  defaults,
  recurrence,
  referenceData,
  submitLabel
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults: { bankAccountId: string; businessUnitId: string };
  recurrence?: RecurrenceLike;
  referenceData: ReferenceData;
  submitLabel: string;
}) {
  const [type, setType] = useState<MovementType>(recurrence?.type ?? "EXPENSE");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(recurrence?.frequency ?? "MONTHLY");
  const [currency, setCurrency] = useState<string>(recurrence?.currency ?? "CLP");
  const matchingAccounts = referenceData.accounts.filter((account) => accountMatchesMovementType(account.type, type));
  const currentAccountStillMatches = recurrence?.accountingAccountId
    ? matchingAccounts.some((account) => account.id === recurrence.accountingAccountId)
    : false;
  const needsDayOfMonth = (monthlyDayFrequencies as readonly RecurrenceFrequency[]).includes(frequency);
  const needsDayOfWeek = (weeklyDayFrequencies as readonly RecurrenceFrequency[]).includes(frequency);

  return (
    <form action={action} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-6">
      {recurrence ? <input name="id" type="hidden" value={recurrence.id} /> : null}
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Tipo</span>
        <select
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="type"
          onChange={(event) => setType(event.target.value as MovementType)}
          value={type}
        >
          <SelectOptions labels={typeLabels} values={movementTypes} />
        </select>
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Cuenta contable</span>
        <select
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          key={type}
          name="accountingAccountId"
          required
          defaultValue={currentAccountStillMatches ? recurrence?.accountingAccountId : ""}
        >
          <option value="">Seleccionar</option>
          {matchingAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {optionLabel(account.code, account.name)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm md:col-span-3">
        <span className="mb-1 block text-slate-600">Descripcion</span>
        <input className="w-full rounded-md border border-slate-300 px-2 py-2" name="description" required defaultValue={recurrence?.description ?? ""} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Monto</span>
        <AmountInput
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          defaultValue={recurrence ? recurrenceAmountToString(recurrence.amount) : ""}
          name="amount"
          required
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Moneda</span>
        <select
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="currency"
          onChange={(event) => setCurrency(event.target.value)}
          value={currency}
        >
          {movementCurrencies.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Cuenta bancaria</span>
        <select
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="bankAccountId"
          required
          defaultValue={recurrence?.bankAccountId ?? defaults.bankAccountId}
        >
          {referenceData.bankAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Unidad de Negocio</span>
        <select
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="businessUnitId"
          required
          defaultValue={recurrence?.businessUnitId ?? defaults.businessUnitId}
        >
          {referenceData.businessUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Proyecto</span>
        <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="projectId" defaultValue={recurrence?.projectId ?? ""}>
          <option value="">Sin proyecto</option>
          {referenceData.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Centro de costo</span>
        <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="costCenterId" defaultValue={recurrence?.costCenterId ?? ""}>
          <option value="">Sin centro de costo</option>
          {referenceData.costCenters.map((costCenter) => (
            <option key={costCenter.id} value={costCenter.id}>
              {optionLabel(costCenter.code, costCenter.name)}
            </option>
          ))}
        </select>
      </label>
      {type === "EXPENSE" ? (
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-slate-600">Proveedor (deuda historica)</span>
          <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="vendorId" defaultValue={recurrence?.vendorId ?? ""}>
            <option value="">Sin proveedor</option>
            {referenceData.vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Frecuencia</span>
        <select
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="frequency"
          onChange={(event) => setFrequency(event.target.value as RecurrenceFrequency)}
          value={frequency}
        >
          <SelectOptions labels={frequencyLabels} values={recurrenceFrequencies} />
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Intervalo {frequency === "EVERY_N_DAYS" ? "(obligatorio)" : ""}</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2 disabled:bg-slate-100"
          disabled={frequency !== "EVERY_N_DAYS"}
          min="1"
          name="intervalDays"
          required={frequency === "EVERY_N_DAYS"}
          type="number"
          defaultValue={recurrence?.intervalDays ?? ""}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Dia del mes {needsDayOfMonth ? "(obligatorio)" : ""}</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2 disabled:bg-slate-100"
          disabled={!needsDayOfMonth}
          max="31"
          min="1"
          name="dayOfMonth"
          required={needsDayOfMonth}
          type="number"
          defaultValue={recurrence ? recurrence.dayOfMonth ?? recurrence.startDate.getDate() : ""}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Dia semana {needsDayOfWeek ? "(obligatorio, 0=domingo)" : ""}</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2 disabled:bg-slate-100"
          disabled={!needsDayOfWeek}
          max="6"
          min="0"
          name="dayOfWeek"
          required={needsDayOfWeek}
          type="number"
          defaultValue={recurrence ? recurrence.dayOfWeek ?? recurrence.startDate.getDay() : ""}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Tasa manual {currency !== "CLP" ? "(respaldo si falla la tasa automatica)" : ""}</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2 disabled:bg-slate-100"
          disabled={currency === "CLP"}
          min="0.000001"
          name="manualRate"
          step="0.000001"
          type="number"
          defaultValue={recurrence?.manualRate ? recurrenceAmountToString(recurrence.manualRate) : ""}
        />
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Motivo tasa manual</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2 disabled:bg-slate-100"
          disabled={currency === "CLP"}
          name="manualRateReason"
          defaultValue={recurrence?.manualRateReason ?? ""}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Inicio</span>
        <input className="w-full rounded-md border border-slate-300 px-2 py-2" name="startDate" required type="date" defaultValue={dateInputValue(recurrence?.startDate ?? null)} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Termino</span>
        <input className="w-full rounded-md border border-slate-300 px-2 py-2" name="endDate" type="date" defaultValue={dateInputValue(recurrence?.endDate ?? null)} />
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Estado inicial</span>
        <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="status" defaultValue={recurrence?.status ?? "PROJECTED"}>
          <SelectOptions labels={statusLabels} values={movementStatuses} />
        </select>
      </label>
      <label className="text-sm md:col-span-6">
        <span className="mb-1 block text-slate-600">Notas</span>
        <textarea className="w-full rounded-md border border-slate-300 px-2 py-2" name="notes" rows={2} defaultValue={recurrence?.notes ?? ""} />
      </label>
      <button className="rounded-md bg-adentu-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-teal md:col-span-1" type="submit">
        {submitLabel}
      </button>
    </form>
  );
}
