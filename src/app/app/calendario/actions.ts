"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  assertCanManageOpeningBalances,
  parseOpeningBalanceAmount,
  parseOpeningBalanceDate
} from "@/lib/opening-balances";
import { prisma } from "@/lib/prisma";

function stringValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function updateOpeningBalanceAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Debes iniciar sesion.");
  }

  assertCanManageOpeningBalances(user.role);

  const balanceDate = parseOpeningBalanceDate(stringValue(formData, "balanceDate"));
  const amount = parseOpeningBalanceAmount(stringValue(formData, "amount"));
  const note = stringValue(formData, "note") || "Saldo inicial actualizado desde Calendario.";

  const bankAccount = await prisma.bankAccount.findFirst({
    where: {
      companyId: user.companyId,
      name: "Cuenta Corriente Santander",
      deletedAt: null
    }
  });

  if (!bankAccount) {
    throw new Error("No existe Cuenta Corriente Santander.");
  }

  const existing = await prisma.openingBalance.findUnique({
    where: {
      bankAccountId_balanceDate: {
        bankAccountId: bankAccount.id,
        balanceDate
      }
    }
  });

  const saved = await prisma.openingBalance.upsert({
    where: {
      bankAccountId_balanceDate: {
        bankAccountId: bankAccount.id,
        balanceDate
      }
    },
    update: {
      amount,
      currency: "CLP",
      note,
      deletedAt: null
    },
    create: {
      companyId: user.companyId,
      bankAccountId: bankAccount.id,
      amount,
      currency: "CLP",
      balanceDate,
      note
    }
  });

  await prisma.auditLog.create({
    data: {
      companyId: user.companyId,
      userId: user.id,
      entity: "OpeningBalance",
      entityId: saved.id,
      action: existing ? "UPDATE" : "CREATE",
      before: existing ? JSON.parse(JSON.stringify(existing)) : undefined,
      after: JSON.parse(JSON.stringify(saved)),
      metadata: {
        source: "calendar-opening-balance",
        bankAccountId: bankAccount.id
      }
    }
  });

  revalidatePath("/app/calendario");
}
