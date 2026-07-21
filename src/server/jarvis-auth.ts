import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export type JarvisAuthResult =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 503;
      message: string;
    };

export function getJarvisRequestToken(headers: Pick<Headers, "get">): string | null {
  const authorization = headers.get("authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch?.[1]) {
    return bearerMatch[1].trim();
  }

  return headers.get("x-jarvis-token")?.trim() || null;
}

function timingSafeTokenEquals(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function validateJarvisRequest(headers: Pick<Headers, "get">, configuredToken = process.env.JARVIS_API_TOKEN): JarvisAuthResult {
  if (!configuredToken) {
    return { ok: false, status: 503, message: "Jarvis API no configurada" };
  }

  const requestToken = getJarvisRequestToken(headers);
  if (!requestToken || !timingSafeTokenEquals(requestToken, configuredToken)) {
    return { ok: false, status: 401, message: "Token Jarvis invalido" };
  }

  return { ok: true };
}

export function jarvisAuthErrorResponse(result: Exclude<JarvisAuthResult, { ok: true }>): NextResponse {
  return NextResponse.json({ error: result.message }, { status: result.status });
}
