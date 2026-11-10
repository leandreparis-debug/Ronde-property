"use client";

import { TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PHOTO_CAPTION_MAX_LENGTH } from "@/server/domain/photos";
import type { PhotoView } from "@/server/photos/types";

import { SheetPanel } from "./sheet-panel";

/**
 * Light sheet shown right after « Photo » placed a photo on the plan (step 12 b): optional
 * caption, zone (prefilled with the last one used on this view), and « En faire une réserve »,
 * which opens the reserve sheet with the photo and the marker already linked.
 */
export function PhotoSheet({
  photo,
  where,
  zones,
  initialZone,
  onSave,
  onMakeReserve,
  onClose,
}: {
  photo: PhotoView | null;
  where: string;
  zones: Array<{ key: string; label: string }>;
  initialZone: string | null;
  onSave: (patch: { caption: string | null; zoneKey: string | null }) => void;
  onMakeReserve: () => void;
  onClose: () => void;
}) {
  const [caption, setCaption] = useState(photo?.caption ?? "");
  const [zone, setZone] = useState(initialZone ?? photo?.zoneKey ?? "");

  function finish(next?: () => void) {
    const patch = { caption: caption.trim() === "" ? null : caption.trim(), zoneKey: zone || null };
    if (patch.caption !== (photo?.caption ?? null) || patch.zoneKey !== (photo?.zoneKey ?? null)) {
      onSave(patch);
    }
    (next ?? onClose)();
  }

  return (
    <SheetPanel
      title="Photo placée"
      subtitle={where}
      onClose={() => finish()}
      closeLabel="Fermer la feuille de la photo"
      testId="photo-sheet"
    >
      <div className="flex gap-3">
        <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-craie">
          {photo?.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob or signed URL
            <img src={photo.thumbUrl} alt="Photo prise" className="size-full object-cover" />
          ) : (
            <span className="text-label text-ink-2">Préparation…</span>
          )}
        </span>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-ui font-semibold">
          Légende (facultative)
          <Input
            value={caption}
            maxLength={PHOTO_CAPTION_MAX_LENGTH}
            onChange={(event) => setCaption(event.target.value)}
            data-testid="photo-sheet-caption"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-ui font-semibold">
        Zone
        <Select
          value={zone}
          onChange={(event) => setZone(event.target.value)}
          data-testid="photo-sheet-zone"
        >
          <option value="">Sans zone</option>
          {zones.map((z) => (
            <option key={z.key} value={z.key}>
              {z.label}
            </option>
          ))}
        </Select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={() => finish(onMakeReserve)}
          data-testid="photo-make-reserve"
        >
          <TriangleAlert className="size-5" aria-hidden="true" />
          En faire une réserve
        </Button>
        <Button type="button" size="lg" onClick={() => finish()} data-testid="photo-sheet-done">
          Terminé
        </Button>
      </div>
    </SheetPanel>
  );
}
