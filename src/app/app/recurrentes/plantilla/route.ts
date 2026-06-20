import { NextResponse } from "next/server";
import { buildRecurrenceImportTemplateBuffer } from "@/lib/recurrence-import";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
  }

  const accounts = await prisma.accountingAccount.findMany({
    where: { companyId: user.companyId, isActive: true, allowMovements: true, deletedAt: null, children: { none: {} } },
    include: { parent: true },
    orderBy: [{ code: "asc" }]
  });

  const buffer = await buildRecurrenceImportTemplateBuffer(
    accounts.map((account) => ({ code: account.code, name: account.name, category: account.parent?.name ?? "" }))
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=plantilla-recurrencias.xlsx",
      "Cache-Control": "no-store"
    }
  });
}
