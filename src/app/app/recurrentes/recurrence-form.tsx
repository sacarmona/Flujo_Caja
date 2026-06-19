"use client";

import { useState } from "react";
import type { AccountingAccountType, MovementStatus, MovementType, RecurrenceFrequency } from "@prisma/client";
import { AmountInput } from "@/components/amount-input";
import { accountMatchesMovementType, movementCurrencies, movementStatuses, movementTypes } from "@/lib/movements";
import { recurrenceAmountToString, recurrenceFrequencies } from "@/lib/recurrence-rules";

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
};

type RecurrenceLike = {
  accountingAccountId: string;
  amount: Parameters<typeof recurrenceAmountToString>[0];
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
  notes: string | null;
  projectId: string | null;
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
  const matchingAccounts = referenceData.accounts.filter((account) => accountMatchesMovementType(account.type, type));
  const currentAccountStillMatches = recurrence?.accountingAccountId
    ? matchingAccounts.some((account) => account.id === recurrence.accountingAccountId)
    : false;

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
        <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="currency" defaultValue={recurrence?.currency ?? "CLP"}>
          {movementCurrencies.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
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
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Frecuencia</span>
        <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="frequency" defaultValue={recurrence?.frequency ?? "MONTHLY"}>
          <SelectOptions labels={frequencyLabels} values={recurrenceFrequencies} />
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Intervalo</span>
        <input className="w-full rounded-md border border-slate-300 px-2 py-2" min="1" name="intervalDays" type="number" defaultValue={recurrence?.intervalDays ?? ""} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Dia del mes</span>
        <input className="w-full rounded-md border border-slate-300 px-2 py-2" max="31" min="1" name="dayOfMonth" type="number" defaultValue={recurrence?.dayOfMonth ?? ""} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Dia semana</span>
        <input className="w-full rounded-md border border-slate-300 px-2 py-2" max="6" min="0" name="dayOfWeek" type="number" defaultValue={recurrence?.dayOfWeek ?? ""} />
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
