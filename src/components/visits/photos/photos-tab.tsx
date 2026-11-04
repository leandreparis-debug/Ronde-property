"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  deletePhotoAction,
  movePhotoAction,
  renewPhotoUrlsAction,
  setCoverPhotoAction,
  updatePhotoAction,
} from "@/server/actions/photo-actions";
import { PHOTO_CATEGORIES, PHOTO_CATEGORY_LABELS, photosCountLabel } from "@/server/domain/photos";
import type { PhotoPatch, PhotoView } from "@/server/photos/types";
import type { PhotoMarkerLink } from "@/server/plans/types";

import { PHOTO_ACCEPT, PhotoPickerButtons } from "./photo-picker-buttons";
import { PhotoThumb } from "./photo-thumb";
import { PhotoViewer, type ZoneOption } from "./photo-viewer";
import { UploadQueuePanel } from "./upload-queue-panel";
import { useUploadQueue } from "./upload-queue-provider";

export interface PhotosTabProps {
  visitId: string;
  initialPhotos: PhotoView[];
  zones: ZoneOption[];
  canEdit: boolean;
  /** Markers linked to the photos, keyed by photo id (« R3 » badges, viewer mention). */
  markersByPhoto?: Record<string, PhotoMarkerLink>;
}

/** Value of the `zone` filter meaning « photos without a zone ». */
export const NO_ZONE_FILTER = "sans";

/**
 * « Photos » tab: picker buttons, filters (zone, category, « Sans légende »), counter, grid of
 * lazy thumbnails, full-screen viewer with the edit panel, upload queue and empty state.
 * Filters and the open photo live in the URL (`?onglet=photos&zone=…&categorie=…&legende=sans&photo=…`).
 */
export function PhotosTab({
  visitId,
  initialPhotos,
  zones,
  canEdit,
  markersByPhoto = {},
}: PhotosTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { uploaded, enqueue } = useUploadQueue();

  const [photos, setPhotos] = useState(initialPhotos);
  const [dragging, setDragging] = useState(false);
  // Filters and the viewer are driven by the URL, so nothing reacts before hydration.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const knownUploads = useRef(0);

  // Server data refreshed (router.refresh after a batch, revalidation): take it as the truth,
  // and keep the photos confirmed meanwhile that the server list may not include yet.
  useEffect(() => {
    setPhotos((list) => {
      const confirmed = uploaded.filter((p) => !initialPhotos.some((x) => x.id === p.id));
      const stillMissing = confirmed.filter((p) => list.some((x) => x.id === p.id));
      return [...initialPhotos, ...stillMissing];
    });
    knownUploads.current = uploaded.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on server data only
  }, [initialPhotos]);

  // Photos confirmed by the queue appear at once, before the server refresh.
  useEffect(() => {
    if (uploaded.length <= knownUploads.current) return;
    const fresh = uploaded.slice(knownUploads.current);
    knownUploads.current = uploaded.length;
    setPhotos((list) => [...list, ...fresh.filter((p) => !list.some((x) => x.id === p.id))]);
  }, [uploaded]);

  const zoneFilter = searchParams.get("zone") ?? "";
  const categoryFilter = searchParams.get("categorie") ?? "";
  const openId = searchParams.get("photo");
  // The checkbox answers at once; the URL (source of truth) follows through the router.
  const [uncaptionedOnly, setUncaptionedOnly] = useState(searchParams.get("legende") === "sans");
  useEffect(() => setUncaptionedOnly(searchParams.get("legende") === "sans"), [searchParams]);

  // Two quick changes (zone then caption filter) must build on each other, not on the URL
  // the router has not updated yet.
  const paramsRef = useRef(searchParams.toString());
  useEffect(() => {
    paramsRef.current = searchParams.toString();
  }, [searchParams]);
  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(paramsRef.current);
      params.set("onglet", "photos");
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      paramsRef.current = params.toString();
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router],
  );

  const visible = useMemo(
    () =>
      photos.filter((photo) => {
        if (zoneFilter === NO_ZONE_FILTER && photo.zoneKey) return false;
        if (zoneFilter && zoneFilter !== NO_ZONE_FILTER && photo.zoneKey !== zoneFilter)
          return false;
        if (categoryFilter && photo.category !== categoryFilter) return false;
        if (uncaptionedOnly && photo.caption) return false;
        return true;
      }),
    [photos, zoneFilter, categoryFilter, uncaptionedOnly],
  );
  const openIndex = openId ? visible.findIndex((p) => p.id === openId) : -1;
  const viewerIndex = openIndex === -1 ? null : openIndex;

  function replacePhoto(next: PhotoView) {
    setPhotos((list) => list.map((p) => (p.id === next.id ? next : p)));
  }

  function replaceAll(next: PhotoView[]) {
    // The server list has fresh URLs and order; keep nothing stale.
    setPhotos(next);
  }

  async function update(photoId: string, patch: PhotoPatch): Promise<string | null> {
    const result = await updatePhotoAction({ photoId, ...patch });
    if (!result.ok) return result.error;
    replacePhoto(result.photo);
    return null;
  }

  async function setCover(photoId: string): Promise<string | null> {
    const result = await setCoverPhotoAction({ photoId });
    if (!result.ok) return result.error;
    replaceAll(result.photos);
    toast({ variant: "success", title: "Photo de garde définie" });
    return null;
  }

  async function move(photoId: string, direction: "before" | "after"): Promise<string | null> {
    const result = await movePhotoAction({ photoId, direction });
    if (!result.ok) return result.error;
    replaceAll(result.photos);
    return null;
  }

  async function remove(photoId: string): Promise<string | null> {
    const result = await deletePhotoAction({ photoId, visitId });
    if (!result.ok) return result.error;
    const index = visible.findIndex((p) => p.id === photoId);
    const next = visible[index + 1] ?? visible[index - 1] ?? null;
    setPhotos((list) => list.filter((p) => p.id !== photoId));
    setParams({ photo: next ? next.id : null });
    toast({ variant: "success", title: "Photo supprimée" });
    return null;
  }

  const renewing = useRef(new Set<string>());
  const renew = useCallback(async (photo: PhotoView) => {
    if (renewing.current.has(photo.id)) return;
    renewing.current.add(photo.id);
    try {
      const result = await renewPhotoUrlsAction({ photoIds: [photo.id] });
      if (result.ok && result.photos[0]) replacePhoto(result.photos[0]);
    } finally {
      renewing.current.delete(photo.id);
    }
  }, []);

  function dropped(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!canEdit) return;
    const accepted = PHOTO_ACCEPT.split(",");
    const files = Array.from(event.dataTransfer.files).filter(
      (file) => accepted.includes(file.type) || file.type === "",
    );
    if (files.length > 0)
      enqueue(files, { zoneKey: zoneFilter && zoneFilter !== NO_ZONE_FILTER ? zoneFilter : null });
  }

  const hasFilter = Boolean(zoneFilter || categoryFilter || uncaptionedOnly);

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg",
        dragging && canEdit && "outline-3 outline-brand outline-dashed",
      )}
      data-testid="photos-tab"
      data-ready={ready ? "true" : undefined}
      onDragOver={(event) => {
        if (!canEdit) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={dropped}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <Field id="photo-zone-filter" label="Zone" className="min-w-[10rem]">
            {(control) => (
              <Select
                {...control}
                value={zoneFilter}
                onChange={(event) => setParams({ zone: event.target.value, photo: null })}
                data-testid="zone-filter"
              >
                <option value="">Toutes les zones</option>
                {zones.map((zone) => (
                  <option key={zone.key} value={zone.key}>
                    {zone.label}
                  </option>
                ))}
                <option value={NO_ZONE_FILTER}>Sans zone</option>
              </Select>
            )}
          </Field>
          <Field id="photo-category-filter" label="Catégorie" className="min-w-[10rem]">
            {(control) => (
              <Select
                {...control}
                value={categoryFilter}
                onChange={(event) => setParams({ categorie: event.target.value, photo: null })}
                data-testid="category-filter"
              >
                <option value="">Toutes les catégories</option>
                {PHOTO_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {PHOTO_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <label className="inline-flex min-h-11 items-center gap-2 text-ui text-ink">
            <input
              type="checkbox"
              className="size-5 accent-brand"
              checked={uncaptionedOnly}
              onChange={(event) => {
                setUncaptionedOnly(event.target.checked);
                setParams({ legende: event.target.checked ? "sans" : null, photo: null });
              }}
              data-testid="uncaptioned-filter"
            />
            Sans légende
          </label>
          <p className="min-h-11 content-center text-ui text-ink-2" data-testid="photos-counter">
            {hasFilter
              ? `${visible.length} sur ${photosCountLabel(photos.length)}`
              : photosCountLabel(photos.length)}
          </p>
        </div>
        {canEdit ? <PhotoPickerButtons /> : null}
      </div>

      {photos.length === 0 ? (
        <EmptyState
          mood="asleep"
          title="Aucune photo pour l'instant"
          description={
            canEdit
              ? "Prenez une photo avec la tablette ou importez des images JPEG, PNG ou WebP : elles sont compressées avant l'envoi."
              : "Les photos de la visite apparaîtront ici."
          }
          action={canEdit ? <PhotoPickerButtons size="lg" /> : null}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          mood="attentive"
          title="Aucune photo pour ces filtres"
          description="Modifiez le filtre de zone, de catégorie ou de légende."
        />
      ) : (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
          data-testid="photo-grid"
        >
          {visible.map((photo) => (
            <PhotoThumb
              key={photo.id}
              photo={photo}
              marker={markersByPhoto[photo.id] ?? null}
              onOpen={(p) => setParams({ photo: p.id })}
              onImageError={(p) => void renew(p)}
            />
          ))}
        </ul>
      )}

      <UploadQueuePanel />

      <PhotoViewer
        photos={visible}
        index={viewerIndex}
        zones={zones}
        canEdit={canEdit}
        markersByPhoto={markersByPhoto}
        onIndexChange={(index) =>
          setParams({ photo: index === null ? null : (visible[index]?.id ?? null) })
        }
        onUpdate={update}
        onSetCover={setCover}
        onMove={move}
        onDelete={remove}
        onImageError={(p) => void renew(p)}
      />
    </div>
  );
}
