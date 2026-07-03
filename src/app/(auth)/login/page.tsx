import { Lock } from "lucide-react";
import { APP_COMPANY_NAME } from "@/lib/constants";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-adentu-mist bg-cover bg-center px-4 py-10"
      style={{ backgroundImage: "url('/login-bg.png')" }}
    >
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white/95 p-8 shadow-lg backdrop-blur-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded bg-adentu-blue text-white">
            <Lock aria-hidden className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-adentu-ink">Iniciar sesion</h1>
            <p className="text-sm text-slate-600">{APP_COMPANY_NAME}</p>
          </div>
        </div>

        <LoginForm />
      </section>
    </main>
  );
}
