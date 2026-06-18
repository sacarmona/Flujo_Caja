import Link from "next/link";
import { CalendarDays, Landmark, ListChecks, Repeat2, Settings, WalletCards } from "lucide-react";
import { APP_COMPANY_NAME, ROLE_LABELS, type AppRole } from "@/lib/constants";

const navigation = [
  { href: "/app/recurrentes", label: "Recurrentes", icon: Repeat2 },
  { href: "/app/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/app/movimientos", label: "Movimientos", icon: WalletCards },
  { href: "/app/conciliacion", label: "Conciliacion", icon: ListChecks },
  { href: "/app/configuracion", label: "Configuracion", icon: Settings }
] as const;

type AppShellProps = {
  children: React.ReactNode;
  user: {
    email: string;
    role: AppRole;
  };
};

export function AppShell({ children, user }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-adentu-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-slate-200 bg-white px-5 py-6 lg:block">
        <Link className="flex items-center gap-3" href="/app">
          <span className="flex size-10 items-center justify-center rounded bg-adentu-blue text-white">
            <Landmark aria-hidden className="size-5" />
          </span>
          <span>
            <span className="block text-base font-semibold">ADENTU Cash Flow</span>
            <span className="block text-xs text-slate-500">{APP_COMPANY_NAME}</span>
          </span>
        </Link>

        <nav className="mt-9 space-y-1">
          {navigation.map((item) => (
            <Link
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-adentu-mist hover:text-adentu-blue"
              href={item.href}
              key={item.href}
            >
              <item.icon aria-hidden className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link className="flex items-center gap-2 font-semibold lg:hidden" href="/app">
              <Landmark aria-hidden className="size-5 text-adentu-blue" />
              ADENTU
            </Link>
            <nav className="flex gap-1 overflow-x-auto lg:hidden">
              {navigation.map((item) => (
                <Link className="rounded-md px-3 py-2 text-xs font-medium text-slate-700" href={item.href} key={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium">{user.email}</p>
                <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
              </div>
              <form action="/api/auth/sign-out" method="post">
                <button
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-adentu-blue hover:text-adentu-blue"
                  type="submit"
                >
                  Salir
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="px-4 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
