"use client";

import { ImageOff, MessageSquareDashed, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { PhotoView } from "@/server/photos/types";
import type { PhotoMarkerLink } from "@/server/plans/types";

/** Reserved box of a thumbnail: 4:3, whatever the photo ratio (object-cover). */
export const THUMB_WIDTH = 400;
export const THUMB_HEIGHT = 300;

/**
 * One tile of the grid: lazy thumbnail with reserved dimensions, truncated caption or
 * « Sans légende », zone badge and the cover star. The whole tile opens the viewer.
 */
export function PhotoThumb({
  photo,
  marker,
  reserves = [],
  onOpen,
  onImageError,
}: {
  photo: PhotoView;
  /** Marker linked to the photo, shown as an « R3 » badge. */
  marker?: PhotoMarkerLink | null;
  /** Reserves the photo illustrates, shown as « R-07 » badges. */
  reserves?: Array<{ reserveId: string; code: string }>;
  onOpen: (photo: PhotoView) => void;
  onImageError?: (photo: PhotoView) => void;
}) {
  const label = photo.caption ?? "Sans légende";
  return (
    <li data-testid="photo-tile" data-photo-id={photo.id}>
      <button
        type="button"
        onClick={() => onOpen(photo)}
        className={cn(
          "group flex w-full flex-col gap-2 rounded-lg border border-rule bg-paper p-2 text-left",
          "hover:border-brand focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
        )}
      >
        <span className="sr-only">Ouvrir la photo : </span>
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-galet">
          {photo.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL, no optimiser
            <img
              src={photo.thumbUrl}
              alt=""
              loading="lazy"
              decoding="async"
              width={THUMB_WIDTH}
              height={THUMB_HEIGHT}
              className="size-full object-cover"
              onError={onImageError ? () => onImageError(photo) : undefined}
            />
          ) : (
            <span className="flex size-full items-center justify-center text-ink-2">
              <ImageOff className="size-8" aria-hidden="true" />
              <span className="sr-only">Image indisponible</span>
            </span>
          )}
          {photo.isCover ? (
            <span
              className="absolute top-2 left-2 inline-flex h-7 items-center gap-1 rounded-pill bg-paper/95 px-2 text-label font-semibold text-ink"
              data-testid="cover-star"
            >
              <Star className="size-4 fill-current text-brand" aria-hidden="true" />
              Garde
            </span>
          ) : null}
          {reserves.length > 0 ? (
            <span
              className="absolute bottom-2 left-2 inline-flex h-7 items-center rounded-pill bg-ink px-2 text-label font-bold text-paper"
              data-testid="photo-reserve-badge"
              title={`Photo de la réserve ${reserves.map((r) => r.code).join(", ")}`}
            >
              {reserves.map((r) => r.code).join(" · ")}
              <span className="sr-only">
                {" "}
                : photo de la réserve {reserves.map((r) => r.code).join(", ")}
              </span>
            </span>
          ) : null}
          {marker ? (
            <span
              className="absolute top-2 right-2 inline-flex h-7 items-center rounded-pill bg-brand px-2 text-label font-bold text-on-brand"
              data-testid="photo-marker-badge"
              title={`Repère n° ${marker.number} sur ${marker.planName}`}
            >
              R{marker.number}
              <span className="sr-only">
                {" "}
                : repère n° {marker.number} sur {marker.planName}
              </span>
            </span>
          ) : null}
        </div>
        <p
          className={cn(
            "flex min-h-6 items-center gap-1.5 truncate text-ui",
            photo.caption ? "font-medium text-ink" : "text-ink-2 italic",
          )}
          data-testid="photo-caption"
        >
          {photo.caption ? null : (
            <MessageSquareDashed className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{label}</span>
        </p>
        <div className="flex min-h-7 flex-wrap items-center gap-1">
          {photo.zoneLabel ? (
            <Badge data-testid="photo-zone">{photo.zoneLabel}</Badge>
          ) : (
            <span className="text-label text-ink-2">Sans zone</span>
          )}
        </div>
      </button>
    </li>
  );
}
