import { NextResponse } from "next/server";
import { buildRecurrenceImportTemplateBuffer } from "@/lib/recurrence-import";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
  }

  const buffer = await buildRecurrenceImportTemplateBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=plantilla-recurrencias.xlsx"
    }
  });
}
