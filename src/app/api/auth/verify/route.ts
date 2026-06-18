import { NextRequest, NextResponse } from "next/server";
import { consumeEmailToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const ok = await consumeEmailToken(token);
  return NextResponse.redirect(new URL(ok ? "/app" : "/login", request.url));
}
