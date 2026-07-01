import { NextResponse } from "next/server";
import type { MovementStatus } from "@prisma/client";
import { clpAmount } from "@/lib/exchange-rates";
import { prisma } from "@/lib/prisma";

/**
 * Endpoint de mantencion one-off: recalcula projectedAmountClp = amount *
 * projectedRate (con clpAmount, 2 decimales) para movimientos en moneda
 * distinta a CLP. Repara los 22 movimientos que un endpoint de mantencion
 * anterior (ya removido) redondeo a entero por error, sin perder precision:
 * amount y projectedRate nunca se tocaron, asi que el recalculo reconstruye
 * el valor decimal original exacto. No toca movimientos PAID_OR_COLLECTED/
 * CANCELLED. Protegido por token (no por sesion), se elimina despues de usar.
 */
const openStatuses: MovementStatus[] = ["PROJECTED", "PENDING", "PARTIALLY_PAID"];

export async function POST(request: Request) {
  const token = request.headers.get("x-maintenance-token");
  if (!token || token !== process.env.MAINTENANCE_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const movements = await prisma.movement.findMany({
    where: { status: { in: openStatuses }, deletedAt: null, currency: { not: "CLP" } },
    select: { id: true, companyId: true, amount: true, projectedRate: true, projectedAmountClp: true }
  });

  const toFix = movements.filter((movement) => {
    const recomputed = clpAmount(movement.amount, movement.projectedRate);
    return !recomputed.equals(movement.projectedAmountClp);
  });

  for (const movement of toFix) {
    const recomputed = clpAmount(movement.amount, movement.projectedRate);
    await prisma.$transaction([
      prisma.movement.update({ where: { id: movement.id }, data: { projectedAmountClp: recomputed } }),
      prisma.auditLog.create({
        data: {
          companyId: movement.companyId,
          userId: null,
          entity: "Movement",
          entityId: movement.id,
          action: "UPDATE",
          before: { projectedAmountClp: movement.projectedAmountClp.toString() },
          after: { projectedAmountClp: recomputed.toString() },
          metadata: { source: "maintenance:recompute-clp-amounts" }
        }
      })
    ]);
  }

  return NextResponse.json({ scanned: movements.length, fixed: toFix.length, ids: toFix.map((m) => m.id) });
}
