import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  FINANCE: "Finanzas",
  MOVEMENT_ENTRY: "Registro de movimientos",
  READ_ONLY: "Solo consulta",
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold">Sesión iniciada</h1>
      <p>
        Usuario: <strong>{session.user.name ?? session.user.email}</strong>
      </p>
      <p>
        Rol: <strong>{ROLE_LABELS[role] ?? role}</strong>
      </p>
      <p className="text-sm text-slate-500">
        Empresa ADENTU Ingeniería SpA — Fase 1 de la aplicación de flujo de caja.
      </p>
    </main>
  );
}
