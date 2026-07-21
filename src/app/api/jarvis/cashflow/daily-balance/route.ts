import { NextResponse } from "next/server";
import { getJarvisDailyBalanceMetric } from "@/lib/jarvis-metrics";
import { prisma } from "@/lib/prisma";
import { jarvisAuthErrorResponse, validateJarvisRequest } from "@/server/jarvis-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = validateJarvisRequest(request.headers);
  if (!auth.ok) {
    return jarvisAuthErrorResponse(auth);
  }

  try {
    return NextResponse.json(await getJarvisDailyBalanceMetric(prisma));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo obtener la metrica diaria." },
      { status: 500 }
    );
  }
}
