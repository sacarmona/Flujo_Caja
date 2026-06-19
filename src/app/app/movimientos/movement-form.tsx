"use client";

import { useState } from "react";
import type { AccountingAccountType, MovementType } from "@prisma/client";
import { AmountInput } from "@/components/amount-input";
import { accountMatchesMovementType, movementCurrencies, movementStatuses, movementTypes } from "@/lib/movements";
import { dateInputValue, optionLabel, statusLabels, todayInputValue, typeLabels, type MovementWithRelations } from "@/app/app/movimientos/shared";

type ReferenceLists = {
  accounts: { id: string; code: string | null; name: string; type: AccountingAccountType }[];
  bankAccounts: { id: string; name: string }[];
  businessUnits: { id: string; name: string }[];
  costCenters: { id: string; code: string | null; name: string }[];
  projects: { id: string; name: string }[];
};

export function SelectOptions<T extends string>({ values, labels }: { values: readonly T[]; labels: Record<T, string> }) {
  return values.map((value) => (
    <option key={value} value={value}>
      {labels[value]}
    </option>
  ));
}

export function MovementForm({
  action,
  accounts,
  bankAccounts,
  businessUnits,
  costCenters,
  defaults,
  movement,
  projects,
  submitLabel
}: ReferenceLists & {
  action: (formData: FormData) => void | Promise<void>;
  defaults: { bankAccountId: string; businessUnitId: string };
  movement?: MovementWithRelations;
  submitLabel: string;
}) {
  const [type, setType] = useState<MovementType>(movement?.type ?? "INCOME");
  const matchingAccounts = accounts.filter((account) => accountMatchesMovementType(account.type, type));
  const currentAccountStillMatches = movement?.accountingAccountId
    ? matchingAccounts.some((account) => account.id === movement.accountingAccountId)
    : false;

  return (
    <form action={action} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-6">
      {movement ? <input name="id" type="hidden" value={movement.id} /> : null}
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
          defaultValue={currentAccountStillMatches ? movement?.accountingAccountId : ""}
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
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="description"
          required
          defaultValue={movement?.description ?? ""}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Monto bruto</span>
        <AmountInput
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          defaultValue={movement?.amount.toString() ?? ""}
          name="amount"
          required
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Moneda</span>
        <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="currency" defaultValue={movement?.currency ?? "CLP"}>
          {movementCurrencies.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Tasa manual</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          min="0.000001"
          name="manualRate"
          step="0.000001"
          type="number"
          defaultValue={movement?.isManualRate ? movement.projectedRate.toString() : ""}
        />
      </label>
      <label className="text-sm md:col-span-3">
        <span className="mb-1 block text-slate-600">Motivo correccion</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="manualRateReason"
          defaultValue={movement?.manualRateReason ?? ""}
        />
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Cuenta bancaria</span>
        <select
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="bankAccountId"
          required
          defaultValue={movement?.bankAccountId ?? defaults.bankAccountId}
        >
          {bankAccounts.map((account) => (
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
          defaultValue={movement?.businessUnitId ?? defaults.businessUnitId}
        >
          {businessUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Proyecto</span>
        <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="projectId" defaultValue={movement?.projectId ?? ""}>
          <option value="">Sin proyecto</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Centro de costo</span>
        <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="costCenterId" defaultValue={movement?.costCenterId ?? ""}>
          <option value="">Sin centro de costo</option>
          {costCenters.map((costCenter) => (
            <option key={costCenter.id} value={costCenter.id}>
              {optionLabel(costCenter.code, costCenter.name)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Fecha proyectada</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="projectedDate"
          required
          type="date"
          defaultValue={movement ? dateInputValue(movement.projectedDate) : todayInputValue()}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Fecha real</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          name="realDate"
          type="date"
          defaultValue={dateInputValue(movement?.realDate ?? null)}
        />
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block text-slate-600">Estado</span>
        <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="status" defaultValue={movement?.status ?? "PROJECTED"}>
          <SelectOptions labels={statusLabels} values={movementStatuses} />
        </select>
      </label>
      <label className="text-sm md:col-span-6">
        <span className="mb-1 block text-slate-600">Notas</span>
        <textarea className="w-full rounded-md border border-slate-300 px-2 py-2" name="notes" rows={2} defaultValue={movement?.notes ?? ""} />
      </label>
      <button className="rounded-md bg-adentu-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-teal md:col-span-1" type="submit">
        {submitLabel}
      </button>
    </form>
  );
}
