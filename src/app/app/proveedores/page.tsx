import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { createVendorAction, setVendorActiveAction, updateVendorAction } from "@/app/app/proveedores/actions";
import { VendorForm } from "@/app/app/proveedores/vendor-form";
import { ErrorBanner } from "@/components/error-banner";
import { SavedBanner } from "@/components/saved-banner";
import { getCurrentUser } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { canManageVendors, isVendorOverpaid, isVendorSettled, vendorPaidAmount, vendorRemainingDebt } from "@/lib/vendors";

async function getVendors(companyId: string) {
  const vendors = await prisma.vendor.findMany({
    where: { companyId, deletedAt: null },
    include: {
      movements: {
        where: { deletedAt: null, cancelledAt: null },
        select: {
          status: true,
          projectedAmountClp: true,
          payments: { where: { deletedAt: null, cancelledAt: null }, select: { amount: true } }
        }
      }
    },
    orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }]
  });

  return vendors.map((vendor) => {
    const paidClp = vendorPaidAmount(vendor.movements);
    const remainingDebt = vendorRemainingDebt(vendor.initialDebtClp, paidClp);
    return { ...vendor, paidClp, remainingDebt };
  });
}

function groupByCategory<T extends { category: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }
  return [...groups.entries()].map(([category, items]) => ({ category, items }));
}

export default async function ProveedoresPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const canManage = canManageVendors(user.role);
  const vendors = await getVendors(user.companyId);
  const categories = [...new Set(vendors.map((vendor) => vendor.category))];
  const groups = groupByCategory(vendors);

  return (
    <section className="max-w-6xl">
      <SavedBanner />
      <ErrorBanner />
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold text-adentu-ink">Proveedores</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Deuda historica por proveedor. El saldo se descuenta automaticamente cuando un movimiento de Egreso vinculado pasa a
          Parcial o Pagado/Cobrado.
        </p>
      </div>

      {canManage ? (
        <details className="mt-8 group">
          <summary className="cursor-pointer list-none text-lg font-semibold text-adentu-ink">
            <span className="inline-flex items-center gap-2">
              <span className="text-adentu-blue transition-transform group-open:rotate-90">▶</span>
              Agregar proveedor
            </span>
          </summary>
          <div className="mt-3">
            <VendorForm action={createVendorAction} categories={categories} submitLabel="Crear" />
          </div>
        </details>
      ) : (
        <p className="mt-8 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Tu rol {user.role} solo permite revisar proveedores. Solo ADMIN y FINANCE pueden administrarlos.
        </p>
      )}

      <div className="mt-10 space-y-8">
        {groups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            No hay proveedores cargados.
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.category}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{group.category}</h2>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Proveedor</th>
                      <th className="px-3 py-2 text-right font-medium">Cuota</th>
                      <th className="px-3 py-2 text-right font-medium">Dia venc.</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 text-right font-medium">Pagado</th>
                      <th className="px-3 py-2 text-right font-medium">Vencido</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                      {canManage ? <th className="px-3 py-2 text-right font-medium">Acciones</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((vendor) => {
                      const settled = isVendorSettled(vendor.remainingDebt);
                      const overpaid = isVendorOverpaid(vendor.remainingDebt);
                      return (
                        <tr className="border-b border-slate-100 align-top last:border-b-0" key={vendor.id}>
                          <td className="px-3 py-2 font-medium text-adentu-ink">{vendor.name}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">
                            {vendor.referenceInstallment ? formatCurrency(Number(vendor.referenceInstallment)) : "-"}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-600">{vendor.dueDay ?? "-"}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">{formatCurrency(Number(vendor.initialDebtClp))}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right text-adentu-teal">{formatCurrency(Number(vendor.paidClp))}</td>
                          <td
                            className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${
                              overpaid ? "text-red-700" : settled ? "text-adentu-teal" : "text-red-700"
                            }`}
                          >
                            {formatCurrency(Number(vendor.remainingDebt))}
                          </td>
                          <td className="px-3 py-2">
                            {overpaid ? (
                              <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                                <AlertTriangle className="size-3" /> Sobrepago
                              </span>
                            ) : settled ? (
                              <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                                <CheckCircle2 className="size-3" /> Liquidado
                              </span>
                            ) : (
                              <span className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                                {vendor.isActive ? "Vigente" : "Inactivo"}
                              </span>
                            )}
                          </td>
                          {canManage ? (
                            <td className="whitespace-nowrap px-3 py-2 text-right">
                              <details className="inline-block text-left">
                                <summary className="cursor-pointer text-sm font-semibold text-adentu-blue">Editar</summary>
                                <div className="mt-2 w-[28rem] max-w-[80vw]">
                                  <VendorForm
                                    action={updateVendorAction}
                                    categories={categories}
                                    submitLabel="Guardar"
                                    vendor={{
                                      id: vendor.id,
                                      category: vendor.category,
                                      name: vendor.name,
                                      referenceInstallment: vendor.referenceInstallment?.toString() ?? null,
                                      dueDay: vendor.dueDay,
                                      initialDebtClp: vendor.initialDebtClp.toString(),
                                      notes: vendor.notes
                                    }}
                                  />
                                  <form action={setVendorActiveAction} className="mt-2">
                                    <input name="id" type="hidden" value={vendor.id} />
                                    <input name="active" type="hidden" value={vendor.isActive ? "false" : "true"} />
                                    <button
                                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-adentu-blue"
                                      type="submit"
                                    >
                                      {vendor.isActive ? "Desactivar" : "Activar"}
                                    </button>
                                  </form>
                                </div>
                              </details>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
