import type { AccountingAccountType } from "@prisma/client";
import type React from "react";
import { createAccountingAccountAction, updateAccountingAccountAction } from "@/app/app/configuracion/accounting-actions";
import { EmptyPage } from "@/components/empty-page";
import { buildAccountingAccountTree, type AccountingAccountNode } from "@/lib/accounting-accounts";
import { APP_COMPANY_NAME, APP_LOCALE, APP_TIME_ZONE, BASE_CURRENCY } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const typeLabels: Record<AccountingAccountType, string> = {
  INCOME: "Ingresos",
  DIRECT_COST: "Costos directos",
  ADMIN_EXPENSE: "Gastos administrativos",
  TAX: "Impuestos",
  FINANCING: "Financiamiento",
  INVESTMENT: "Inversiones",
  NON_OPERATIONAL: "Movimientos no operacionales"
};

async function getAccounts(companyId: string) {
  return prisma.accountingAccount.findMany({
    where: { companyId, deletedAt: null },
    include: {
      _count: {
        select: {
          children: true,
          movements: true
        }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }]
  });
}

function AccountOptions({ accounts, currentId }: { accounts: AccountingAccountNode[]; currentId?: string }) {
  function renderOptions(items: AccountingAccountNode[], prefix = ""): React.ReactElement[] {
    return items.flatMap((account) => {
      const disabled = account.id === currentId;
      const option = (
        <option disabled={disabled} key={account.id} value={account.id}>
          {prefix}
          {account.code} - {account.name}
        </option>
      );

      return [option, ...renderOptions(account.children, `${prefix}-- `)];
    });
  }

  return (
    <>
      <option value="">Sin cuenta padre</option>
      {renderOptions(accounts)}
    </>
  );
}

function TypeOptions() {
  return Object.entries(typeLabels).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}

function AccountEditor({
  account,
  accounts,
  isAdmin
}: {
  account: AccountingAccountNode;
  accounts: AccountingAccountNode[];
  isAdmin: boolean;
}) {
  return (
    <li className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-adentu-blue">{account.code}</span>
              <h3 className="text-base font-semibold text-adentu-ink">{account.name}</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {typeLabels[account.type]} · Nivel {account.level} · Orden {account.sortOrder}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded border border-slate-200 px-2 py-1">{account.isActive ? "Activa" : "Inactiva"}</span>
            <span className="rounded border border-slate-200 px-2 py-1">
              {account.allowMovements && (account._count?.children ?? 0) === 0 ? "Permite movimientos" : "No recibe movimientos"}
            </span>
            {(account._count?.movements ?? 0) > 0 ? (
              <span className="rounded border border-adentu-gold px-2 py-1 text-adentu-gold">Usada</span>
            ) : null}
          </div>
        </div>

        {isAdmin ? (
          <details className="group mt-3 border-t border-slate-100 pt-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-adentu-blue">
              <span className="inline-flex items-center gap-2">
                <span className="transition-transform group-open:rotate-90">▶</span>
                Editar
              </span>
            </summary>
            <form action={updateAccountingAccountAction} className="mt-3 grid gap-3 md:grid-cols-6">
              <input name="id" type="hidden" value={account.id} />
              <label className="text-sm md:col-span-1">
                <span className="mb-1 block text-slate-600">Codigo</span>
                <input className="w-full rounded-md border border-slate-300 px-2 py-2" name="code" required defaultValue={account.code} />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-slate-600">Nombre</span>
                <input className="w-full rounded-md border border-slate-300 px-2 py-2" name="name" required defaultValue={account.name} />
              </label>
              <label className="text-sm md:col-span-1">
                <span className="mb-1 block text-slate-600">Orden</span>
                <input
                  className="w-full rounded-md border border-slate-300 px-2 py-2"
                  name="sortOrder"
                  type="number"
                  defaultValue={account.sortOrder}
                />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-slate-600">Cuenta padre</span>
                <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="parentId" defaultValue={account.parentId ?? ""}>
                  <AccountOptions accounts={accounts} currentId={account.id} />
                </select>
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-slate-600">Tipo</span>
                <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="type" defaultValue={account.type}>
                  <TypeOptions />
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input name="isActive" type="checkbox" defaultChecked={account.isActive} />
                Activa
              </label>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input
                  name="allowMovements"
                  type="checkbox"
                  defaultChecked={account.allowMovements}
                  disabled={(account._count?.children ?? 0) > 0}
                />
                Permite movimientos
              </label>
              <button
                className="rounded-md bg-adentu-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-teal md:col-span-1"
                type="submit"
              >
                Guardar
              </button>
            </form>
          </details>
        ) : null}
      </div>

      {account.children.length > 0 ? <AccountTree accounts={account.children} allAccounts={accounts} isAdmin={isAdmin} /> : null}
    </li>
  );
}

function AccountTree({
  accounts,
  allAccounts,
  isAdmin
}: {
  accounts: AccountingAccountNode[];
  allAccounts: AccountingAccountNode[];
  isAdmin: boolean;
}) {
  return (
    <ol className="ml-0 space-y-3 border-l border-slate-200 pl-4">
      {accounts.map((account) => (
        <AccountEditor account={account} accounts={allAccounts} isAdmin={isAdmin} key={account.id} />
      ))}
    </ol>
  );
}

export default async function ConfiguracionPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";
  const accounts = user ? buildAccountingAccountTree(await getAccounts(user.companyId)) : [];

  return (
    <section className="max-w-6xl">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold text-adentu-ink">Configuracion</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Parametros base de la empresa unica y administracion del plan de cuentas.
        </p>
      </div>
      <dl className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

      <div className="mt-10 border-b border-slate-200 pb-5">
        <h2 className="text-xl font-semibold text-adentu-ink">Plan de cuentas</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Cuentas jerarquicas para clasificar movimientos de flujo de caja. Las cuentas padre no reciben movimientos.
        </p>
      </div>

      {isAdmin ? (
        <form action={createAccountingAccountAction} className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-5 md:grid-cols-6">
          <label className="text-sm md:col-span-1">
            <span className="mb-1 block text-slate-600">Codigo</span>
            <input className="w-full rounded-md border border-slate-300 px-2 py-2" name="code" required />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-slate-600">Nombre</span>
            <input className="w-full rounded-md border border-slate-300 px-2 py-2" name="name" required />
          </label>
          <label className="text-sm md:col-span-1">
            <span className="mb-1 block text-slate-600">Orden</span>
            <input className="w-full rounded-md border border-slate-300 px-2 py-2" name="sortOrder" type="number" defaultValue={0} />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-slate-600">Cuenta padre</span>
            <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="parentId">
              <AccountOptions accounts={accounts} />
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-slate-600">Tipo</span>
            <select className="w-full rounded-md border border-slate-300 px-2 py-2" name="type" defaultValue="INCOME">
              <TypeOptions />
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="isActive" type="checkbox" defaultChecked />
            Activa
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input name="allowMovements" type="checkbox" defaultChecked />
            Permite movimientos
          </label>
          <button className="rounded-md bg-adentu-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-teal" type="submit">
            Crear cuenta
          </button>
        </form>
      ) : (
        <p className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Solo usuarios ADMIN pueden modificar el plan de cuentas.
        </p>
      )}

      <div className="mt-6">
        {accounts.length > 0 ? (
          <AccountTree accounts={accounts} allAccounts={accounts} isAdmin={isAdmin} />
        ) : (
          <EmptyPage description="Ejecuta el seed para cargar el plan de cuentas inicial." title="Plan de cuentas sin datos" />
        )}
      </div>
    </section>
  );
}
