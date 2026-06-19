import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1, "La contrasena es obligatoria.")
});

export const sessionCookieName = process.env.AUTH_COOKIE_NAME ?? "adentu_session";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * Autentica por usuario y contrasena. No crea usuarios nuevos: el alta de
 * usuarios es responsabilidad exclusiva de ADMIN (ver seed/gestion de
 * usuarios), nunca implicita al iniciar sesion.
 */
export async function signInWithPassword(rawEmail: string, rawPassword: string): Promise<boolean> {
  const parsed = credentialsSchema.safeParse({ email: rawEmail, password: rawPassword });
  if (!parsed.success) {
    return false;
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    return false;
  }

  const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!isValid) {
    return false;
  }

  const sessionToken = randomBytes(32).toString("base64url");
  const sessionTtl = Number(process.env.SESSION_TTL_DAYS ?? 7);
  const expiresAt = daysFromNow(sessionTtl);

  await prisma.session.create({
    data: {
      tokenHash: hashToken(sessionToken),
      userId: user.id,
      expiresAt
    }
  });

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/"
  });

  return true;
}

export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(sessionCookieName)?.value;

  if (!sessionToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(sessionToken) },
    include: {
      user: {
        include: {
          company: true
        }
      }
    }
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session.user;
});

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(sessionCookieName)?.value;

  if (sessionToken) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(sessionToken) } });
  }

  cookieStore.delete(sessionCookieName);
}
