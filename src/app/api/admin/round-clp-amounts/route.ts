import { NextResponse } from "next/server";
import type { MovementStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Endpoint de mantencion one-off: redondea projectedAmountClp a entero (el
 * CLP no tiene decimales) para movimientos abiertos ya existentes, creados
 * antes del fix de clpAmount() que ahora redondea en origen. No toca
 * movimientos PAID_OR_COLLECTED/CANCELLED para no alterar historial cerrado.
 * Protegido por token (no por sesion) porque se ejecuta una sola vez desde
 * fuera del navegador. Eliminar este archivo despues de usarlo.
 */
const openStatuses: MovementStatus[] = ["PROJECTED", "PENDING", "PARTIALLY_PAID"];

export async function POST(request: Request) {
  const token = request.headers.get("x-maintenance-token");
  if (!token || token !== process.env.MAINTENANCE_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const movements = await prisma.movement.findMany({
    where: { status: { in: openStatuses }, deletedAt: null },
    select: { id: true, projectedAmountClp: true, companyId: true }
  });

  const toFix = movements.filter((movement) => !movement.projectedAmountClp.equals(movement.projectedAmountClp.toDecimalPlaces(0)));

  for (const movement of toFix) {
    const rounded = movement.projectedAmountClp.toDecimalPlaces(0);
    await prisma.$transaction([
      prisma.movement.update({ where: { id: movement.id }, data: { projectedAmountClp: rounded } }),
      prisma.auditLog.create({
        data: {
          companyId: movement.companyId,
          userId: null,
          entity: "Movement",
          entityId: movement.id,
          action: "UPDATE",
          before: { projectedAmountClp: movement.projectedAmountClp.toString() },
          after: { projectedAmountClp: rounded.toString() },
          metadata: { source: "maintenance:round-clp-amounts" }
        }
      })
    ]);
  }

  return NextResponse.json({ scanned: movements.length, rounded: toFix.length, ids: toFix.map((m) => m.id) });
}
