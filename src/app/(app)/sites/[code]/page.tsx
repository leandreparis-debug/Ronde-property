import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatDateTime, formatNumber, formatSurface } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { VISIT_REASON_LABELS, VISIT_STATUS_LABELS } from "@/server/domain/enums";
import { getSiteWithVisits } from "@/server/services/sites";

type Params = Promise<{ code: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { code } = await params;
  return { title: `Site ${decodeURIComponent(code).toUpperCase()}` };
}

/** Read-only site page with its visits. Unknown codes render the RONDE 404. */
export default async function SitePage({ params }: { params: Params }) {
  const user = await requireUser();
  const { code } = await params;
  const data = await getSiteWithVisits(decodeURIComponent(code));
  if (!data) notFound();
  const { site, visits } = data;
  const canCreate = (user.role === "rt" || user.role === "admin") && site.isActive;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <span>{site.warehouseCode}</span>
            {site.category ? <span>· {site.category}</span> : null}
            {site.isActive ? null : <Badge>Inactif</Badge>}
          </span>
        }
        title={site.name}
        actions={
          canCreate ? (
            <Button asChild size="lg">
              <Link href={`/visites/nouvelle?site=${encodeURIComponent(site.warehouseCode)}`}>
                Nouvelle visite sur ce site
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader>
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-ui">
              <dt className="text-ink-2">Adresse</dt>
              <dd>{site.address ?? "—"}</dd>
              <dt className="text-ink-2">Ville</dt>
              <dd>{[site.postalCode, site.city].filter(Boolean).join(" ") || "—"}</dd>
              <dt className="text-ink-2">Surface</dt>
              <dd>{formatSurface(site.surfaceM2)}</dd>
              <dt className="text-ink-2">Catégorie</dt>
              <dd>{site.category ?? "—"}</dd>
              {site.latitude !== null && site.longitude !== null ? (
                <>
                  <dt className="text-ink-2">Coordonnées</dt>
                  <dd>
                    {formatNumber(site.latitude, 5)}, {formatNumber(site.longitude, 5)}
                  </dd>
                </>
              ) : null}
            </dl>
            <p className="text-label text-ink-2">
              Source : référentiel VIGIE, mis à jour le{" "}
              {site.importedAt ? formatDateTime(site.importedAt) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Visites du site</CardTitle>
          </CardHeader>
          <CardContent>
            {visits.length === 0 ? (
              <EmptyState
                mood="asleep"
                title="Aucune visite"
                description="Les visites de ce site apparaîtront ici."
                className="py-6"
              />
            ) : (
              <ul className="divide-y divide-rule" aria-label="Visites">
                {visits.map((visit) => (
                  <li key={visit.id} data-testid="site-visit">
                    <Link
                      href={`/visites/${visit.id}`}
                      className="flex min-h-touch-lg flex-col gap-1 rounded-md py-3 hover:bg-brand-tint"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-ui text-ink-2">{formatDate(visit.visitDate)}</span>
                        <Badge variant="brand">{VISIT_STATUS_LABELS[visit.status]}</Badge>
                      </div>
                      <p className="text-body font-semibold text-ink">{visit.title}</p>
                      <p className="text-ui text-ink-2">
                        {VISIT_REASON_LABELS[visit.reason]} · {visit.openReservesCount} réserve
                        {visit.openReservesCount > 1 ? "s" : ""} ouverte
                        {visit.openReservesCount > 1 ? "s" : ""}
                        {visit.overdueReservesCount > 0
                          ? ` dont ${visit.overdueReservesCount} en retard`
                          : ""}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
