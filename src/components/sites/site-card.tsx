import { ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatSurface } from "@/lib/format";
import type { Site } from "@/server/domain";

/** Touch-friendly card linking to the site page. */
export function SiteCard({ site }: { site: Site }) {
  return (
    <Card className="transition-colors hover:bg-brand-tint">
      <Link
        href={`/sites/${encodeURIComponent(site.warehouseCode)}`}
        className="flex min-h-touch-lg items-center gap-4 rounded-lg p-4"
        data-testid={`site-${site.warehouseCode}`}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="brand">{site.warehouseCode}</Badge>
            {site.isActive ? null : <Badge>Inactif</Badge>}
            {site.category ? <span className="text-label text-ink-2">{site.category}</span> : null}
          </div>
          <p className="truncate text-body font-semibold text-ink">{site.name}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ui text-ink-2">
            {site.city ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" aria-hidden="true" />
                {site.city}
              </span>
            ) : null}
            <span>{formatSurface(site.surfaceM2)}</span>
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-ink-2" aria-hidden="true" />
      </Link>
    </Card>
  );
}
