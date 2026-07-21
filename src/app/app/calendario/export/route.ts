import { NextResponse } from "next/server";
import { getCalendarData, type CalendarSearchParams } from "@/app/app/calendario/data";
import { getCurrentUser } from "@/lib/auth";
import { buildCalendarExportBuffer } from "@/lib/calendar-export";
import { dateInputValue } from "@/lib/opening-balances";

export const maxDuration = 60;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const filters: CalendarSearchParams = {
    months: searchParams.get("months") ?? undefined,
    mode: (searchParams.get("mode") as CalendarSearchParams["mode"]) ?? undefined,
    businessUnitId: searchParams.get("businessUnitId") ?? undefined,
    accountingAccountId: searchParams.get("accountingAccountId") ?? undefined,
    status: (searchParams.get("status") as CalendarSearchParams["status"]) ?? undefined,
    type: (searchParams.get("type") as CalendarSearchParams["type"]) ?? undefined,
    currency: (searchParams.get("currency") as CalendarSearchParams["currency"]) ?? undefined
  };

  const data = await getCalendarData(user.companyId, filters);

  const buffer = await buildCalendarExportBuffer({
    rows: data.rows,
    days: data.result.days,
    mode: data.mode,
    balances: data.balances,
    openingBalanceLabel: "Saldo inicial Santander",
    openingBalance: data.headlineOpeningBalance,
    bankAccountName: "Cuenta Corriente Santander"
  });

  const filename = `calendario-${dateInputValue(data.today)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Cache-Control": "no-store"
    }
  });
}
