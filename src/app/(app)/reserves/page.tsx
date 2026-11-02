import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Mes réserves",
};

/**
 * « Mes réserves »: reserves raised during the RT's visits. Empty until step 9.
 */
export default async function ReservesPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Mes réserves" />
      <EmptyState
        mood="asleep"
        title="Aucune réserve à suivre"
        description="Les réserves relevées pendant vos visites seront regroupées ici, jusqu'à leur levée."
      />
    </>
  );
}
