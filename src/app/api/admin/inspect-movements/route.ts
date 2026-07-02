import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Endpoint de mantencion one-off, solo lectura: devuelve projectedDate en
 * ISO (UTC) para movimientos por descripcion, para confirmar si su fecha
 * guardada esta desplazada por el bug de parseo sin "Z" (ver commit
 * 257cc6c). Protegido por token (no por sesion). Eliminar despues de usarlo.
 */
export async function POST(request: Request) {
  const token = request.headers.get("x-maintenance-token");
  if (!token || token !== process.env.MAINTENANCE_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { descriptions?: string[] };
  const descriptions = body.descriptions ?? [];

  const movements = await prisma.movement.findMany({
    where: { description: { in: descriptions }, deletedAt: null },
    select: { id: true, description: true, projectedDate: true, status: true, createdAt: true, updatedAt: true }
  });

  return NextResponse.json(
    movements.map((m) => ({
      id: m.id,
      description: m.description,
      status: m.status,
      projectedDateIso: m.projectedDate.toISOString(),
      createdAtIso: m.createdAt.toISOString(),
      updatedAtIso: m.updatedAt.toISOString()
    }))
  );
}
