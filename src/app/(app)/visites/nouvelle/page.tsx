import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { VisitCreateForm } from "@/components/visits/visit-create-form";
import { requireRole } from "@/server/auth/session";
import { createSiteRepository } from "@/server/repositories/site-repository";
import { listAssignable } from "@/server/services/visits";

export const metadata: Metadata = {
  title: "Nouvelle visite",
};

/** Visit creation, optionally pre-filled with `?site=CODE`. rt and admin only. */
export default async function NewVisitPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string | string[] }>;
}) {
  const user = await requireRole(["rt", "admin"]);
  const params = await searchParams;
  const code = (Array.isArray(params.site) ? params.site[0] : params.site)?.trim();

  let presetSite = null;
  let presetError: string | undefined;
  if (code) {
    const site = await createSiteRepository(user).getByCode(code);
    if (site && site.isActive) {
      presetSite = {
        id: site.id,
        warehouseCode: site.warehouseCode,
        name: site.name,
        city: site.city,
      };
    } else {
      presetError = site
        ? `Le site ${site.warehouseCode} est inactif : choisissez un site actif.`
        : `Le site « ${code} » est introuvable : choisissez un site du référentiel.`;
    }
  }
  const writers = await listAssignable();

  return (
    <>
      <PageHeader eyebrow="Visites" title="Nouvelle visite" />
      <Card className="max-w-3xl p-5 md:p-6">
        <VisitCreateForm
          presetSite={presetSite}
          presetError={presetError}
          writers={writers}
          currentUserId={user.id}
        />
      </Card>
    </>
  );
}
