import type { Metadata } from "next";
import { SiteImportWizard } from "@/components/admin/site-import-wizard";
import { requireRole } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Import des sites",
};

/** Admin: import a VIGIE CSV export, simulation first, then confirmed application. */
export default async function SiteImportPage() {
  await requireRole(["admin"]);
  return (
    <>
      <h2 className="sr-only">Import des sites</h2>
      <p className="mb-4 max-w-2xl text-ui text-ink-2">
        Importez l&apos;export CSV de VIGIE. La simulation ne modifie rien ; l&apos;application
        écrit les changements en une transaction. Aucun site n&apos;est jamais supprimé. Les imports
        passés sont dans « Historique des imports ».
      </p>
      <SiteImportWizard />
    </>
  );
}
