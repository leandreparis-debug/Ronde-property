"use client";

import { Images } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PhotoPickerButtons } from "@/components/visits/photos/photo-picker-buttons";
import { useUploadQueue } from "@/components/visits/photos/upload-queue-provider";
import { UploadQueuePanel } from "@/components/visits/photos/upload-queue-panel";
import type { PhotoView } from "@/server/photos/types";

/**
 * Photos of one zone under the notes editor: counter, « Ajouter une photo à cette zone »
 * (camera or import with the zone pre-filled) and a strip of thumbnails that opens the
 * viewer of the Photos tab. Photos confirmed by the queue join the strip at once.
 */
export function ZonePhotos({
  zoneKey,
  photos,
  canEdit,
}: {
  zoneKey: string;
  photos: PhotoView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { uploaded } = useUploadQueue();

  const all = [
    ...photos,
    ...uploaded.filter((p) => p.zoneKey === zoneKey && !photos.some((x) => x.id === p.id)),
  ];

  function open(photoId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("onglet", "photos");
    params.set("zone", zoneKey);
    params.set("photo", photoId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
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
            {all.length} photo{all.length > 1 ? "s" : ""} liée{all.length > 1 ? "s" : ""}
          </span>
        </p>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ui text-ink-2">Ajouter une photo à cette zone :</span>
            <PhotoPickerButtons zoneKey={zoneKey} compact />
          </div>
        ) : null}
      </div>
      {all.length > 0 ? (
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" data-testid="zone-photo-strip">
          {all.map((photo) => (
            <li key={photo.id} className="shrink-0">
              <button
                type="button"
                onClick={() => open(photo.id)}
                className="block size-24 overflow-hidden rounded-md border border-rule bg-galet hover:border-brand focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand"
                aria-label={`Ouvrir la photo : ${photo.caption ?? "Sans légende"}`}
              >
                {photo.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL
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
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit ? <UploadQueuePanel /> : null}
    </section>
  );
}
