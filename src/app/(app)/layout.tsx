import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/server/auth/session";

/** Route group of the application screens: signed-in users only, wrapped in the shell. */
export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
