"use client";

import { AmountInput } from "@/components/amount-input";

/** Solo strings/numeros planos: Vendor viene de un Server Component y sus campos Decimal no son serializables hacia un Client Component. */
type VendorLike = {
  id: string;
  category: string;
  name: string;
  referenceInstallment: string | null;
  dueDay: number | null;
  initialDebtClp: string;
  notes: string | null;
};

export function VendorForm({
  action,
  categories,
  submitLabel,
  vendor
}: {
  action: (formData: FormData) => void;
  categories: string[];
  submitLabel: string;
  vendor?: VendorLike;
}) {
  return (
    <form action={action} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
      {vendor ? <input name="id" type="hidden" value={vendor.id} /> : null}
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Categoria</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          defaultValue={vendor?.category ?? ""}
          list="vendor-categories"
          name="category"
          placeholder="PP proveedores"
          required
        />
        <datalist id="vendor-categories">
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Proveedor</span>
        <input className="w-full rounded-md border border-slate-300 px-2 py-2" defaultValue={vendor?.name ?? ""} name="name" required />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Cuota (referencial)</span>
        <AmountInput
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          defaultValue={vendor?.referenceInstallment?.toString() ?? ""}
          name="referenceInstallment"
          placeholder="$0"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Dia de vencimiento</span>
        <input
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          defaultValue={vendor?.dueDay ?? ""}
          max={31}
          min={1}
          name="dueDay"
          type="number"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-slate-600">Total adeudado</span>
        <AmountInput
          className="w-full rounded-md border border-slate-300 px-2 py-2"
          defaultValue={vendor?.initialDebtClp.toString() ?? ""}
          name="initialDebtClp"
          placeholder="$0"
          required
        />
      </label>
      <label className="text-sm sm:col-span-2 lg:col-span-3">
        <span className="mb-1 block text-slate-600">Notas</span>
        <textarea className="w-full rounded-md border border-slate-300 px-2 py-2" defaultValue={vendor?.notes ?? ""} name="notes" rows={2} />
      </label>
      <button
        className="self-end rounded-md bg-adentu-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-teal sm:col-span-2 lg:col-span-1"
        type="submit"
      >
        {submitLabel}
      </button>
    </form>
  );
}
