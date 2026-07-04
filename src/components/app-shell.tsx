"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, CalendarDays, ChevronLeft, ChevronRight, History, ListChecks, Repeat2, Settings, WalletCards } from "lucide-react";
import { APP_COMPANY_NAME, ROLE_LABELS, type AppRole } from "@/lib/constants";

const navigation = [
  { href: "/app/recurrentes", label: "Recurrentes", icon: Repeat2 },
  { href: "/app/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/app/movimientos", label: "Movimientos", icon: WalletCards },
  { href: "/app/conciliacion", label: "Conciliacion", icon: ListChecks },
  { href: "/app/proveedores", label: "Proveedores", icon: Building2 },
  { href: "/app/bitacora", label: "Bitacora", icon: History },
  { href: "/app/configuracion", label: "Configuracion", icon: Settings }
] as const;

const collapsedStorageKey = "adentu-sidebar-collapsed";

type AppShellProps = {
  children: React.ReactNode;
  user: {
    email: string;
    role: AppRole;
  };
};

export function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(collapsedStorageKey) === "true");
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem(collapsedStorageKey, String(next));
  }

  return (
    <div className="min-h-screen bg-adentu-mist text-adentu-ink">
      <aside
        className={`fixed inset-y-0 left-0 hidden flex-col bg-adentu-navy py-6 transition-[width] lg:flex ${
          collapsed ? "w-20 px-3" : "w-72 px-5"
        }`}
      >
        <Link className="flex items-center gap-3" href="/app">
          <Image alt="ADENTU" className="shrink-0" height={40} priority src="/brand-icon.png" width={40} />
          {collapsed ? null : (
            <span>
              <span className="block text-base font-semibold text-white">ADENTU Cash Flow</span>
              <span className="block text-xs text-slate-300">{APP_COMPANY_NAME}</span>
            </span>
          )}
        </Link>

        <nav className="mt-9 flex-1 space-y-1">
          {navigation.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-adentu-navy-light text-white" : "text-slate-300 hover:bg-adentu-navy-light hover:text-white"
                } ${collapsed ? "justify-center" : ""}`}
                href={item.href}
                key={item.href}
                title={collapsed ? item.label : undefined}
              >
                <item.icon aria-hidden className="size-4 shrink-0" />
                {collapsed ? null : item.label}
              </Link>
            );
          })}
        </nav>

        <button
          aria-label={collapsed ? "Expandir menu" : "Ocultar menu"}
          className="flex items-center justify-center gap-2 self-stretch rounded-md border border-adentu-navy-light px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-white hover:text-white"
          onClick={toggleCollapsed}
          type="button"
        >
          {collapsed ? <ChevronRight aria-hidden className="size-4" /> : <ChevronLeft aria-hidden className="size-4" />}
          {collapsed ? null : "Ocultar"}
        </button>
      </aside>

      <div className={collapsed ? "lg:pl-20" : "lg:pl-72"}>
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link className="flex items-center gap-2 font-semibold lg:hidden" href="/app">
              <Image alt="ADENTU" height={24} src="/brand-icon.png" width={24} />
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
