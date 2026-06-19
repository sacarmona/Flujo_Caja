"use server";

import { redirect } from "next/navigation";
import { signInWithPassword } from "@/lib/auth";

export async function signInAction(formData: FormData): Promise<{ error: string } | void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const ok = await signInWithPassword(email, password);

  if (!ok) {
    return { error: "Correo o contrasena incorrectos." };
  }

  redirect("/app");
}
