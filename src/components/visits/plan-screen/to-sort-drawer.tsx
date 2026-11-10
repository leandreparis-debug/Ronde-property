"use client";

import { MapPin, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PhotoView } from "@/server/photos/types";

import { SheetPanel } from "./sheet-panel";

/**
 * Drawer « À ranger » of the plan screen (step 12 b): the photos taken with the shutter, not
 * placed yet. For each one: « Placer » (the next tap on the plan places it), « Sans
 * emplacement » (it leaves the drawer, kept in the photos of the visit) and « En faire une
 * réserve » (reserve sheet with the photo as defect photo).
 */
export function ToSortDrawer({
  photos,
  viewTitle,
  canEdit,
  onPlace,
  onKeepUnplaced,
  onMakeReserve,
  onClose,
}: {
  photos: PhotoView[];
  /** Short title of the view a photo was taken on (« Bât. B R+1 »). */
  viewTitle: (viewId: string | null) => string | null;
  canEdit: boolean;
  onPlace: (photo: PhotoView) => void;
  onKeepUnplaced: (photo: PhotoView) => void;
  onMakeReserve: (photo: PhotoView) => void;
  onClose: () => void;
}) {
  return (
    <SheetPanel
      title={`À ranger (${photos.length})`}
      subtitle="Photos prises avec le déclencheur"
      onClose={onClose}
      closeLabel="Fermer « À ranger »"
      testId="to-sort-drawer"
    >
      {photos.length === 0 ? (
        <p className="text-ui text-ink-2">Toutes les photos sont rangées.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {photos.map((photo) => {
            const where = viewTitle(photo.hintViewId);
            return (
              <li
                key={photo.id}
                className="flex flex-col gap-2 rounded-lg border border-rule bg-paper p-2"
                data-testid="to-sort-photo"
                data-photo-id={photo.id}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-craie">
                    {photo.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local blob or signed URL
                      <img src={photo.thumbUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="text-label text-ink-2">Préparation…</span>
                    )}
                  </span>
                  <span className="min-w-0 text-ui text-ink">
                    {photo.caption ?? "Photo sans légende"}
                    {where ? (
                      <span className="block text-label text-ink-2">Prise sur {where}</span>
                    ) : null}
                  </span>
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => onPlace(photo)}
                      data-testid="to-sort-place"
                    >
                      <MapPin className="size-4" aria-hidden="true" />
                      Placer
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => onKeepUnplaced(photo)}
                      data-testid="to-sort-unplaced"
                    >
                      <X className="size-4" aria-hidden="true" />
                      Sans emplacement
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => onMakeReserve(photo)}
                      data-testid="to-sort-reserve"
                    >
                      <TriangleAlert className="size-4" aria-hidden="true" />
                      En faire une réserve
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SheetPanel>
  );
}
