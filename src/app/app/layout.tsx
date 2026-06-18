import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import type { AppRole } from "@/lib/constants";

export default async function AuthenticatedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return <AppShell user={{ email: user.email, role: user.role as AppRole }}>{children}</AppShell>;
}
