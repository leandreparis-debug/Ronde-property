import { Plus, TriangleAlert } from "lucide-react";

import { QueryLink } from "@/components/offline/query-link";
import { type ZoneReserveCounts, zoneReservesLabel } from "@/lib/reserves/list";
import { newReserveHref } from "@/lib/reserves/links";
import { Button } from "@/components/ui/button";

/**
 * Reserves of one zone under the notes editor: « 2 réserves ouvertes » (or « 3 levées » when
 * all are done), linked to the Reserves tab filtered on the zone with the default filters, and
 * « + Réserve » (sheet with the zone prefilled).
 */
export function ZoneReserves({
  zoneKey,
  counts,
  canEdit,
}: {
  zoneKey: string;
  counts: ZoneReserveCounts;
  canEdit: boolean;
}) {
  const label = zoneReservesLabel(counts);
  const listHref = `?${new URLSearchParams({ onglet: "reserves", zone: zoneKey }).toString()}`;
  return (
    <section
      aria-label="Réserves de la zone"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-rule bg-paper px-4 py-3"
      data-testid="zone-reserves"
    >
      <p className="inline-flex min-h-11 items-center gap-2 text-ui font-semibold text-ink">
        <TriangleAlert className="size-5 text-ink-2" aria-hidden="true" />
        {label ? (
          <QueryLink
            href={listHref}
            className="inline-flex min-h-11 items-center text-brand-deep underline"
            data-testid="zone-reserves-link"
          >
            {label}
          </QueryLink>
        ) : (
          <span className="text-ink-2" data-testid="zone-reserves-link">
            Aucune réserve
          </span>
        )}
      </p>
      {canEdit ? (
        <Button asChild variant="secondary">
          <QueryLink href={newReserveHref({ zoneKey })} data-testid="zone-add-reserve">
            <Plus className="size-4" aria-hidden="true" />
            Réserve
            <span className="sr-only"> dans cette zone</span>
          </QueryLink>
        </Button>
      ) : null}
    </section>
  );
}
