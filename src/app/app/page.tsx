import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { EmptyPage } from "@/components/empty-page";
import {
  dateInputValue,
  firstNegativeBalanceDay,
  lastBusinessDayOfMonth,
  monthRange,
  netPendingBalanceForMonth,
  parseDashboardDate
} from "@/lib/dashboard";
import { formatCurrency, formatDate, todayInAppTimeZone } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { calculateSantanderCashFlow } from "@/lib/cash-flow-service";
import { getHolidayKeys } from "@/lib/holidays-cl";
import { prisma } from "@/lib/prisma";

type AppHomePageProps = {
  searchParams: Promise<{ targetDate?: string }>;
};

export default async function AppHomePage({ searchParams }: AppHomePageProps) {
  const user = await getCurrentUser();
  if (!user) return null;

  const params = await searchParams;
  const today = todayInAppTimeZone();
  const holidays = await getHolidayKeys(prisma);
  const defaultTargetDate = lastBusinessDayOfMonth(today, holidays);
  const targetDate = parseDashboardDate(params.targetDate, defaultTargetDate);
  const cashFlow = await calculateSantanderCashFlow({
    prisma,
    companyId: user.companyId,
    startDate: today,
    endDate: targetDate,
    holidays
  });
  const projectedBalance = cashFlow.days.at(-1)?.accumulatedBalance ?? cashFlow.openingBalance;
  const currentMonth = monthRange(today);
  const pendingMovements = await prisma.movement.findMany({
    where: {
      companyId: user.companyId,
      deletedAt: null,
      cancelledAt: null,
      status: "PENDING",
      projectedDate: {
        gte: currentMonth.start,
        lte: currentMonth.end
      }
    },
    select: {
      type: true,
      projectedAmountClp: true
    }
  });
  const pendingBalance = netPendingBalanceForMonth(pendingMovements);
  const negativeDay = firstNegativeBalanceDay(cashFlow.days);

  return (
    <section className="max-w-5xl">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold text-adentu-ink">Resumen de flujo de caja</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Vista inicial preparada para consolidar saldos, vencimientos y alertas de caja en CLP.
        </p>
      </div>
      {negativeDay ? (
        <Link
          className="mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 transition hover:border-red-300"
          href="/app/calendario"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-red-700" />
          <p className="text-sm text-red-800">
            <span className="font-semibold">Saldo negativo proyectado:</span> el {formatDate(negativeDay.date)} el saldo acumulado caeria a{" "}
            {formatCurrency(Number(negativeDay.accumulatedBalance))}. Ver detalle en Calendario.
          </p>
        </Link>
      ) : null}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Saldo proyectado</p>
          <p className="mt-2 text-2xl font-semibold">{formatCurrency(Number(projectedBalance))}</p>
          <form className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-500" htmlFor="targetDate">
              Fecha objetivo
            </label>
            <input
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              defaultValue={dateInputValue(targetDate)}
              id="targetDate"
              name="targetDate"
              type="date"
            />
            <button className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:border-adentu-blue" type="submit">
              Actualizar
            </button>
          </form>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Fecha de trabajo</p>
          <p className="mt-2 text-2xl font-semibold">{formatDate(today)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Pendientes</p>
          <p className="mt-2 text-2xl font-semibold">{formatCurrency(Number(pendingBalance))}</p>
          <p className="mt-3 text-xs text-slate-500">{pendingMovements.length} movimientos pendientes del mes en curso</p>
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
