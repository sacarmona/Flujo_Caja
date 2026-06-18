import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Flujo de Caja — ADENTU Ingeniería SpA</h1>
      <p className="text-slate-600">Fase 1: base del sistema en construcción.</p>
      <Link
        href="/dashboard"
        className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
      >
        Iniciar sesión
      </Link>
    </main>
  );
}
