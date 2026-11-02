import type { Metadata } from "next";

import { Trail } from "@/components/brand/Trail";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Mes visites",
};

/**
 * « Mes visites »: list of the RT's visits. Empty until step 5.
 */
export default async function VisitsPage() {
  await requireUser();
  return (
    <>
      <PageHeader
        title="Mes visites"
        actions={
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Button size="lg" disabled aria-describedby="new-visit-hint">
              Nouvelle visite
            </Button>
            <span id="new-visit-hint" className="text-label text-ink-2">
              Disponible à l&apos;étape 5
            </span>
          </div>
        }
      />
      <EmptyState
        mood="asleep"
        illustration={<Trail width={280} />}
        title="Aucune visite pour l'instant"
        description="Vos visites apparaîtront ici, sur la tablette comme sur l'ordinateur."
      />
    </>
  );
}
