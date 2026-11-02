import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin/admin-nav";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth/session";

/** Administration section: admin role only (403 otherwise). */
export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireRole(["admin"]);
  return (
    <>
      <PageHeader eyebrow="Administration" title="Administration" />
      <AdminNav />
      {children}
    </>
  );
}
