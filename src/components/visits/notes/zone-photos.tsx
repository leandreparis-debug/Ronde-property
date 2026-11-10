"use client";

import { Images } from "lucide-react";

import { PendingDot } from "@/components/offline/pending-dot";
import { PhotoPickerButtons } from "@/components/visits/photos/photo-picker-buttons";
import { UploadQueuePanel } from "@/components/visits/photos/upload-queue-panel";
import { replaceQuery } from "@/lib/offline/query";
import type { PhotoView } from "@/server/photos/types";

/**
 * Photos of one zone under the notes editor: counter, « Ajouter une photo à cette zone »
 * (camera or import with the zone pre-filled) and a strip of thumbnails that opens the
 * viewer of the Photos tab. A photo taken here joins the strip at once, before its upload.
 */
export function ZonePhotos({
  zoneKey,
  photos,
  canEdit,
}: {
  zoneKey: string;
  photos: Array<PhotoView & { uploadStatus?: "pending" | "ready" }>;
  canEdit: boolean;
}) {
  function open(photoId: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("onglet", "photos");
    params.set("zone", zoneKey);
    params.set("photo", photoId);
    replaceQuery(params);
  }

  return (
    <section
      aria-label="Photos de la zone"
      className="flex flex-col gap-3 rounded-md border border-rule bg-paper px-4 py-3"
      data-testid="zone-photos"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex min-h-11 items-center gap-2 text-ui font-semibold text-ink">
          <Images className="size-5 text-ink-2" aria-hidden="true" />
          <span data-testid="zone-photos-count">
            {photos.length} photo{photos.length > 1 ? "s" : ""} liée{photos.length > 1 ? "s" : ""}
          </span>
        </p>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ui text-ink-2">Ajouter une photo à cette zone :</span>
            <PhotoPickerButtons zoneKey={zoneKey} compact />
          </div>
        ) : null}
      </div>
      {photos.length > 0 ? (
        <ul
          className="relative -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          data-testid="zone-photo-strip"
        >
          {photos.map((photo) => (
            <li key={photo.id} className="relative shrink-0">
              <button
                type="button"
                onClick={() => open(photo.id)}
                className="block size-24 overflow-hidden rounded-md border border-rule bg-galet hover:border-brand focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand"
                aria-label={`Ouvrir la photo : ${photo.caption ?? "Sans légende"}`}
              >
                {photo.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed or local URL
                  <img
                    src={photo.thumbUrl}
                    alt=""
                    loading="lazy"
                    width={96}
                    height={96}
                    className="size-24 object-cover"
                  />
                ) : null}
              </button>
              {photo.uploadStatus === "pending" ? (
                <PendingDot className="absolute top-1 right-1 rounded-pill bg-paper px-1" />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit ? <UploadQueuePanel /> : null}
    </section>
  );
}
