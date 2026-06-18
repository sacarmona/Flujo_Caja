import Link from "next/link";

type CheckEmailPageProps = {
  searchParams: Promise<{
    email?: string;
    token?: string;
  }>;
};

export default async function CheckEmailPage({ searchParams }: CheckEmailPageProps) {
  const { email, token } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-adentu-mist px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-adentu-ink">Revisa tu correo</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Se preparo un enlace de acceso para {email ?? "tu correo"}. En desarrollo se muestra aqui para facilitar la
          configuracion inicial.
        </p>
        {token ? (
          <Link
            className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-adentu-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-adentu-teal"
            href={`/api/auth/verify?token=${encodeURIComponent(token)}`}
          >
            Entrar a la aplicacion
          </Link>
        ) : null}
      </section>
    </main>
  );
}
