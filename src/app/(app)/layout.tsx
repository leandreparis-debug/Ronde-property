import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

/** Route group of the application screens, all wrapped in the shell. */
export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
