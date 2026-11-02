import type { Metadata } from "next";

import { ImportRunsTable } from "@/components/admin/import-runs-table";
import { requireRole } from "@/server/auth/session";
import { listImportRuns } from "@/server/services/site-imports";

export const metadata: Metadata = {
  title: "Historique des imports",
};

/** Admin: past simulations and applied imports. */
export default async function ImportRunsPage() {
  await requireRole(["admin"]);
  const runs = await listImportRuns();
  return (
    <>
      <h2 className="sr-only">Historique des imports</h2>
      <ImportRunsTable runs={runs} />
    </>
  );
}
