import { Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { newReserveHref } from "@/lib/reserves/links";
import { Button } from "@/components/ui/button";

/**
 * Reserves of one zone under the notes editor: « N réserves » (link to the Reserves tab
 * filtered on the zone, done reserves shown) and « + Réserve » (sheet with the zone prefilled).
 */
export function ZoneReserves({
  zoneKey,
  count,
  canEdit,
}: {
  zoneKey: string;
  count: number;
  canEdit: boolean;
}) {
  const listHref = `?${new URLSearchParams({ onglet: "reserves", zone: zoneKey, levees: "afficher" }).toString()}`;
  return (
    <section
      aria-label="Réserves de la zone"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-rule bg-paper px-4 py-3"
      data-testid="zone-reserves"
    >
      <p className="inline-flex min-h-11 items-center gap-2 text-ui font-semibold text-ink">
        <TriangleAlert className="size-5 text-ink-2" aria-hidden="true" />
        {count > 0 ? (
          <Link
            href={listHref}
            scroll={false}
            className="inline-flex min-h-11 items-center text-brand-deep underline"
            data-testid="zone-reserves-link"
          >
            {count} réserve{count > 1 ? "s" : ""}
          </Link>
        ) : (
          <span className="text-ink-2" data-testid="zone-reserves-link">
            Aucune réserve
          </span>
        )}
      </p>
      {canEdit ? (
        <Button asChild variant="secondary">
          <Link href={newReserveHref({ zoneKey })} scroll={false} data-testid="zone-add-reserve">
            <Plus className="size-4" aria-hidden="true" />
            Réserve
            <span className="sr-only"> dans cette zone</span>
          </Link>
        </Button>
      ) : null}
    </section>
  );
}
