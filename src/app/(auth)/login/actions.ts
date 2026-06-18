"use server";

import { redirect } from "next/navigation";
import { requestEmailSignIn } from "@/lib/auth";

export async function requestSignInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const result = await requestEmailSignIn(email);

  redirect(`/login/check-email?email=${encodeURIComponent(result.email)}&token=${encodeURIComponent(result.token)}`);
}
