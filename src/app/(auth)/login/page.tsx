import { Mail } from "lucide-react";
import { requestSignInAction } from "@/app/(auth)/login/actions";
import { APP_COMPANY_NAME } from "@/lib/constants";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-adentu-mist px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded bg-adentu-blue text-white">
            <Mail aria-hidden className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-adentu-ink">Ingreso por correo</h1>
            <p className="text-sm text-slate-600">{APP_COMPANY_NAME}</p>
          </div>
        </div>

        <form action={requestSignInAction} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700" htmlFor="email">
            Correo electronico
          </label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-adentu-blue focus:ring-2 focus:ring-adentu-blue/20"
            id="email"
            name="email"
            placeholder="nombre@adentu.cl"
            required
            type="email"
          />
          <button
            className="inline-flex w-full items-center justify-center rounded-md bg-adentu-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-adentu-teal"
            type="submit"
          >
            Enviar enlace de acceso
          </button>
        </form>
      </section>
    </main>
  );
}
