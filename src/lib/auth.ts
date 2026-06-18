import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { z } from "zod";
import { APP_COMPANY_NAME } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

const emailSchema = z.string().trim().email().toLowerCase();

export const sessionCookieName = process.env.AUTH_COOKIE_NAME ?? "adentu_session";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function requestEmailSignIn(rawEmail: string): Promise<{ email: string; token: string; expiresAt: Date }> {
  const email = emailSchema.parse(rawEmail);
  const token = randomBytes(32).toString("base64url");
  const ttl = Number(process.env.AUTH_TOKEN_TTL_MINUTES ?? 15);
  const expiresAt = minutesFromNow(ttl);

  await prisma.emailLoginToken.create({
    data: {
      email,
      tokenHash: hashToken(token),
      expiresAt
    }
  });

  return { email, token, expiresAt };
}

export async function consumeEmailToken(token: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const loginToken = await prisma.emailLoginToken.findUnique({ where: { tokenHash } });

  if (!loginToken || loginToken.usedAt || loginToken.expiresAt < new Date()) {
    return false;
  }

  const company = await prisma.company.upsert({
    where: { name: APP_COMPANY_NAME },
    update: {},
    create: { name: APP_COMPANY_NAME }
  });

  const user = await prisma.user.upsert({
    where: { email: loginToken.email },
    update: {},
    create: {
      email: loginToken.email,
      role: "READ_ONLY",
      companyId: company.id
    }
  });

  const sessionToken = randomBytes(32).toString("base64url");
  const sessionTtl = Number(process.env.SESSION_TTL_DAYS ?? 7);
  const expiresAt = daysFromNow(sessionTtl);

  await prisma.$transaction([
    prisma.emailLoginToken.update({
      where: { id: loginToken.id },
      data: { usedAt: new Date() }
    }),
    prisma.session.create({
      data: {
        tokenHash: hashToken(sessionToken),
        userId: user.id,
        expiresAt
      }
    })
  ]);

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
