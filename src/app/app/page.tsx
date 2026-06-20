import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  dateInputValue,
  firstNegativeBalanceDay,
  lastBusinessDayOfMonth,
  monthRange,
  netPendingBalanceForMonth,
  parseDashboardDate,
  upcomingWeeklySummaries
} from "@/lib/dashboard";
import { formatCurrency, formatDate, todayInAppTimeZone } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { calculateSantanderCashFlow } from "@/lib/cash-flow-service";
import { getHolidayKeys } from "@/lib/holidays-cl";
import { prisma } from "@/lib/prisma";

type AppHomePageProps = {
  searchParams: Promise<{ targetDate?: string }>;
};

function weekLabel(date: Date) {
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit" }).format(date);
}

export default async function AppHomePage({ searchParams }: AppHomePageProps) {
  const user = await getCurrentUser();
  if (!user) return null;

  const params = await searchParams;
  const today = todayInAppTimeZone();
  const holidays = await getHolidayKeys(prisma);
  const defaultTargetDate = lastBusinessDayOfMonth(today, holidays);
  const targetDate = parseDashboardDate(params.targetDate, defaultTargetDate);
  const [cashFlow, monthAheadCashFlow] = await Promise.all([
    calculateSantanderCashFlow({
      prisma,
      companyId: user.companyId,
      startDate: today,
      endDate: targetDate,
      holidays
    }),
    calculateSantanderCashFlow({
      prisma,
      companyId: user.companyId,
      startDate: today,
      months: 1,
      holidays
    })
  ]);
  const projectedBalance = cashFlow.days.at(-1)?.accumulatedBalance ?? cashFlow.openingBalance;
  const weeklySummaries = upcomingWeeklySummaries(monthAheadCashFlow, 4);
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
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-adentu-ink">Proximas semanas</h2>
          <Link className="text-sm font-semibold text-adentu-blue" href="/app/calendario">
            Ver Calendario completo
          </Link>
        </div>
        {weeklySummaries.length > 0 ? (
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-adentu-mist">
                  <th className="px-3 py-2 text-left font-semibold text-adentu-ink">Semana</th>
                  <th className="px-3 py-2 text-right font-semibold text-adentu-ink">Ingresos</th>
                  <th className="px-3 py-2 text-right font-semibold text-adentu-ink">Egresos</th>
                  <th className="px-3 py-2 text-right font-semibold text-adentu-ink">Flujo neto</th>
                  <th className="px-3 py-2 text-right font-semibold text-adentu-ink">Saldo al cierre</th>
                </tr>
              </thead>
              <tbody>
                {weeklySummaries.map((week) => (
                  <tr className="border-t border-slate-200" key={dateInputValue(week.weekStart)}>
                    <td className="px-3 py-2 text-left font-medium text-adentu-ink">
                      {weekLabel(week.weekStart)} - {weekLabel(week.weekEnd)}
                    </td>
                    <td className="px-3 py-2 text-right text-adentu-teal">{formatCurrency(Number(week.income))}</td>
                    <td className="px-3 py-2 text-right text-red-700">{formatCurrency(Number(week.expense))}</td>
                    <td className={`px-3 py-2 text-right font-medium ${week.netFlow.isNegative() ? "text-red-700" : "text-adentu-ink"}`}>
                      {formatCurrency(Number(week.netFlow))}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${week.endingBalance.isNegative() ? "text-red-700" : "text-adentu-ink"}`}>
                      {formatCurrency(Number(week.endingBalance))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">No hay dias habiles proyectados en las proximas semanas.</p>
        )}
      </div>
    </section>
  );
}
