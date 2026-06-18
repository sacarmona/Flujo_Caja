import { EmptyPage } from "@/components/empty-page";
import { formatCurrency, formatDate } from "@/lib/format";

export default function AppHomePage() {
  return (
    <section className="max-w-5xl">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold text-adentu-ink">Resumen de flujo de caja</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Vista inicial preparada para consolidar saldos, vencimientos y alertas de caja en CLP.
        </p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Saldo proyectado</p>
          <p className="mt-2 text-2xl font-semibold">{formatCurrency(0)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Fecha de trabajo</p>
          <p className="mt-2 text-2xl font-semibold">{formatDate(new Date())}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Pendientes</p>
          <p className="mt-2 text-2xl font-semibold">0</p>
        </div>
      </div>
      <div className="mt-8">
        <EmptyPage
          description="La pantalla de resumen queda lista para conectar indicadores cuando se definan los flujos operativos."
          title="Panel principal"
        />
      </div>
    </section>
  );
}
