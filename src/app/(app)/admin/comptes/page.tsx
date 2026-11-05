import type { Metadata } from "next";

import { AccountsManager } from "@/components/admin/accounts-manager";
import { requireRole } from "@/server/auth/session";
import { listAccounts } from "@/server/services/accounts";

export const metadata: Metadata = {
  title: "Comptes",
};

/** Account administration: list, create, edit, activate, reset, sessions, GDPR. */
export default async function AccountsPage() {
  await requireRole(["admin"]);
  const accounts = await listAccounts();
  return (
    <>
      <h2 className="sr-only">Comptes</h2>
      <AccountsManager
        accounts={accounts.map((account) => ({
          id: account.id,
          email: account.email,
          fullName: account.fullName,
          role: account.role,
          isActive: account.isActive,
          anonymized: account.anonymizedAt !== null,
          createdAt: account.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
