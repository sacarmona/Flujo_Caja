import { EmptyPage } from "@/components/empty-page";
import { APP_COMPANY_NAME, APP_LOCALE, APP_TIME_ZONE, BASE_CURRENCY } from "@/lib/constants";

export default function ConfiguracionPage() {
  return (
    <section className="max-w-4xl">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold text-adentu-ink">Configuracion</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Parametros base de la empresa unica y convenciones regionales.
        </p>
      </div>
      <dl className="mt-8 grid gap-4 md:grid-cols-2">
        {[
          ["Empresa", APP_COMPANY_NAME],
          ["Formato", APP_LOCALE],
          ["Zona horaria", APP_TIME_ZONE],
          ["Moneda base", BASE_CURRENCY]
        ].map(([label, value]) => (
          <div className="rounded-lg border border-slate-200 bg-white p-5" key={label}>
            <dt className="text-sm text-slate-500">{label}</dt>
            <dd className="mt-2 font-semibold text-adentu-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-8">
        <EmptyPage
          description="Los formularios de configuracion se agregaran cuando se definan permisos y administracion operativa."
          title="Opciones administrativas"
        />
      </div>
    </section>
  );
}
