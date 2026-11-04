import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { reserveHref } from "@/lib/reserves/links";
import type { SiteReservesSummary } from "@/server/reserves/types";

import { ReserveCard } from "./reserve-card";

/**
 * « Réserves ouvertes » of a site page: counters (open, overdue, urgent) and the ten most
 * urgent open reserves of every visit of the site, each linked to its detail and to its
 * original visit. Visible to every active user (read access follows the visits).
 */
export function SiteReservesSection({ summary }: { summary: SiteReservesSummary }) {
  const more = summary.open - summary.items.length;
  return (
    <Card data-testid="site-reserves">
      <CardHeader>
        <CardTitle>Réserves ouvertes</CardTitle>
        <p className="text-body text-ink" data-testid="site-reserves-counters">
          <strong>
            {summary.open} ouverte{summary.open > 1 ? "s" : ""}
          </strong>
          <span className="text-ink-2"> · </span>
          <strong className={summary.overdue > 0 ? "text-status-open" : undefined}>
            {summary.overdue} en retard
          </strong>
          <span className="text-ink-2"> · </span>
          <strong>
            {summary.urgent} urgente{summary.urgent > 1 ? "s" : ""}
          </strong>
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {summary.items.length === 0 ? (
          <EmptyState
            mood="happy"
            title="Aucune réserve ouverte"
            description="Toutes les réserves de ce site sont levées."
            className="py-6"
          />
        ) : (
          <ul className="grid gap-3 xl:grid-cols-2" data-testid="site-reserves-list">
            {summary.items.map((reserve) => (
              <li key={reserve.id}>
                <ReserveCard
                  reserve={reserve}
                  href={reserveHref(reserve.visitId, reserve.id)}
                  context={
                    <Link
                      href={`/visites/${reserve.visitId}?onglet=reserves`}
                      className="relative z-10 inline-flex min-h-11 items-center font-semibold text-brand-deep underline"
                      data-testid="site-reserve-visit"
                    >
                      {reserve.visitTitle} · {formatDate(reserve.visitDate)}
                    </Link>
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {more > 0 ? (
          <p className="text-ui text-ink-2">
            Les 10 plus urgentes sont affichées ; {more} autre{more > 1 ? "s" : ""} dans les visites
            du site.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
