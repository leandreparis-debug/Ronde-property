"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  MapPin,
  Star,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { type TouchEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import {
  PHOTO_CAPTION_MAX_LENGTH,
  PHOTO_CATEGORIES,
  PHOTO_CATEGORY_LABELS,
  type PhotoCategory,
  photoCategoryLabel,
} from "@/server/domain/photos";
import type { PhotoPatch, PhotoView } from "@/server/photos/types";
import type { PhotoMarkerLink } from "@/server/plans/types";

export interface ZoneOption {
  key: string;
  label: string;
}

export interface PhotoViewerProps {
  photos: PhotoView[];
  /** Index of the photo shown; `null` closes the viewer. */
  index: number | null;
  zones: ZoneOption[];
  canEdit: boolean;
  /** Markers linked to the photos, keyed by photo id. */
  markersByPhoto?: Record<string, PhotoMarkerLink>;
  /** Reserves illustrated by each photo, with the link to their detail page. */
  reservesByPhoto?: Record<string, PhotoReserveMention[]>;
  onIndexChange: (index: number | null) => void;
  /** Saves a patch; resolves with the error message, or `null`. */
  onUpdate: (photoId: string, patch: PhotoPatch) => Promise<string | null>;
  onSetCover: (photoId: string) => Promise<string | null>;
  onMove: (photoId: string, direction: "before" | "after") => Promise<string | null>;
  onDelete: (photoId: string) => Promise<string | null>;
  /** The signed URL stopped working: fetch fresh ones. */
  onImageError: (photo: PhotoView) => void;
}

const SWIPE_MIN_PX = 60;
const CAPTION_DEBOUNCE_MS = 800;

type CaptionStatus = "idle" | "saving" | "saved" | "error";

/**
 * Full-screen viewer: 1600 px image, previous / next (buttons, arrow keys, swipe), Escape to
 * close, pinch zoom left to the browser. With `canEdit`, a side panel edits the caption
 * (autosave), the category, the zone, the cover, the order and deletes with a confirmation.
 */
export function PhotoViewer({
  photos,
  index,
  zones,
  canEdit,
  markersByPhoto = {},
  reservesByPhoto = {},
  onIndexChange,
  onUpdate,
  onSetCover,
  onMove,
  onDelete,
  onImageError,
}: PhotoViewerProps) {
  const photo = index === null ? null : (photos[index] ?? null);
  const open = photo !== null;
  const touchStart = useRef<number | null>(null);

  function go(delta: number) {
    if (index === null) return;
    const next = index + delta;
    if (next >= 0 && next < photos.length) onIndexChange(next);
  }

  function onTouchStart(event: TouchEvent) {
    touchStart.current = event.touches.length === 1 ? (event.touches[0]?.clientX ?? null) : null;
  }
  function onTouchEnd(event: TouchEvent) {
    if (touchStart.current === null) return;
    const end = event.changedTouches[0]?.clientX ?? touchStart.current;
    const delta = end - touchStart.current;
    touchStart.current = null;
    if (Math.abs(delta) < SWIPE_MIN_PX) return;
    go(delta < 0 ? 1 : -1);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onIndexChange(null))}>
      <DialogContent
        hideCloseButton
        aria-describedby={undefined}
        className="top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none p-0 motion-safe:data-[state=open]:animate-fade-in"
        data-testid="photo-viewer"
        onKeyDown={(event) => {
          if (event.target instanceof HTMLTextAreaElement) return;
          if (event.key === "ArrowRight") {
            event.preventDefault();
            go(1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            go(-1);
          }
        }}
      >
        {photo ? (
          <div className="flex h-full flex-col lg:flex-row">
            <div className="relative flex min-h-0 flex-1 flex-col bg-ink text-on-brand">
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <DialogPrimitive.Title className="min-w-0 truncate text-ui font-semibold">
                  {photo.caption ?? "Sans légende"}
                  <span className="text-on-brand/70">
                    {" "}
                    · {index! + 1}/{photos.length}
                  </span>
                </DialogPrimitive.Title>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-on-brand hover:bg-on-brand/15 hover:text-on-brand"
                    aria-label="Fermer la visionneuse"
                  >
                    <X className="size-5" aria-hidden="true" />
                    <span className="hidden sm:inline">Fermer</span>
                  </Button>
                </DialogClose>
              </div>
              <div
                className="relative flex min-h-0 flex-1 items-center justify-center"
                style={{ touchAction: "pinch-zoom" }}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
              >
                {photo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL
                  <img
                    key={photo.url}
                    src={photo.url}
                    alt={photo.caption ?? `Photo ${index! + 1}`}
                    width={photo.width ?? undefined}
                    height={photo.height ?? undefined}
                    className="max-h-full max-w-full object-contain"
                    onError={() => onImageError(photo)}
                    data-testid="viewer-image"
                  />
                ) : (
                  <p className="flex flex-col items-center gap-2 text-on-brand/80">
                    <ImageOff className="size-10" aria-hidden="true" />
                    Image indisponible
                  </p>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  onClick={() => go(-1)}
                  disabled={index === 0}
                  aria-label="Photo précédente"
                  className="absolute top-1/2 left-2 -translate-y-1/2 bg-ink/50 text-on-brand hover:bg-ink/70 hover:text-on-brand"
                >
                  <ChevronLeft className="size-6" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  onClick={() => go(1)}
                  disabled={index === photos.length - 1}
                  aria-label="Photo suivante"
                  className="absolute top-1/2 right-2 -translate-y-1/2 bg-ink/50 text-on-brand hover:bg-ink/70 hover:text-on-brand"
                >
                  <ChevronRight className="size-6" aria-hidden="true" />
                </Button>
              </div>
            </div>
            <aside
              className="flex max-h-[45dvh] w-full shrink-0 flex-col gap-4 overflow-y-auto border-t border-rule bg-paper p-4 lg:max-h-none lg:w-[360px] lg:border-t-0 lg:border-l"
              aria-label="Détails de la photo"
              data-testid="viewer-panel"
            >
              {canEdit ? (
                <EditPanel
                  key={photo.id}
                  photo={photo}
                  marker={markersByPhoto[photo.id] ?? null}
                  reserves={reservesByPhoto[photo.id] ?? []}
                  zones={zones}
                  isFirst={index === 0}
                  isLast={index === photos.length - 1}
                  onUpdate={onUpdate}
                  onSetCover={onSetCover}
                  onMove={onMove}
                  onDelete={onDelete}
                />
              ) : (
                <ReadonlyPanel
                  photo={photo}
                  marker={markersByPhoto[photo.id] ?? null}
                  reserves={reservesByPhoto[photo.id] ?? []}
                />
              )}
            </aside>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Reserve illustrated by a photo, with the link to its detail page. */
export interface PhotoReserveMention {
  reserveId: string;
  code: string;
  href: string;
}

/** « Photo de la réserve R-07 » with a link to the reserve, one line per reserve. */
function ReserveMentions({ reserves }: { reserves: PhotoReserveMention[] }) {
  if (reserves.length === 0) return null;
  return (
    <>
      {reserves.map((reserve) => (
        <p
          key={reserve.reserveId}
          className="flex flex-wrap items-center gap-1 rounded-md bg-craie px-3 py-2 text-ui text-ink"
          data-testid="photo-reserve-mention"
        >
          <TriangleAlert className="size-4 text-ink-2" aria-hidden="true" />
          Photo de la réserve {reserve.code}
          <a
            href={reserve.href}
            className="inline-flex min-h-11 items-center font-semibold text-brand-deep underline"
          >
            Voir la réserve
          </a>
        </p>
      ))}
    </>
  );
}

/** « Repère n° 3 sur {plan} » with a link to the plan centred on the marker. */
function MarkerMention({ marker }: { marker: PhotoMarkerLink | null | undefined }) {
  if (!marker) return null;
  return (
    <p
      className="flex flex-wrap items-center gap-1 rounded-md bg-brand-tint px-3 py-2 text-ui text-ink"
      data-testid="photo-marker-mention"
    >
      <MapPin className="size-4 text-brand" aria-hidden="true" />
      Repère n° {marker.number} sur {marker.planName}
      <a
        href={`?onglet=plans&plan=${marker.planId}&page=${marker.page}&repere=${marker.markerId}`}
        className="inline-flex min-h-11 items-center font-semibold text-brand-deep underline"
      >
        Voir sur le plan
      </a>
    </p>
  );
}

function Meta({ photo }: { photo: PhotoView }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ui text-ink-2">
      <dt>Prise le</dt>
      <dd className="text-ink">{photo.takenAt ? formatDateTime(photo.takenAt) : "—"}</dd>
      <dt>Ajoutée</dt>
      <dd className="text-ink">
        {formatDateTime(photo.createdAt)}
        {photo.createdByName ? ` · ${photo.createdByName}` : ""}
      </dd>
      <dt>Taille</dt>
      <dd className="text-ink">
        {photo.width && photo.height ? `${photo.width} × ${photo.height} px` : "—"}
        {photo.sizeBytes ? ` · ${Math.round(photo.sizeBytes / 1024)} Ko` : ""}
      </dd>
      {photo.originalFilename ? (
        <>
          <dt>Fichier</dt>
          <dd className="truncate text-ink">{photo.originalFilename}</dd>
        </>
      ) : null}
    </dl>
  );
}

function ReadonlyPanel({
  photo,
  marker,
  reserves,
}: {
  photo: PhotoView;
  marker: PhotoMarkerLink | null;
  reserves: PhotoReserveMention[];
}) {
  return (
    <>
      <MarkerMention marker={marker} />
      <ReserveMentions reserves={reserves} />
      <ReserveMentions reserves={reserves} />
      <div>
        <p className="label-caps text-ink-2">Légende</p>
        <p className={cn("text-body", photo.caption ? "text-ink" : "text-ink-2 italic")}>
          {photo.caption ?? "Sans légende"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="label-caps text-ink-2">Catégorie</p>
          <p className="text-body text-ink">{photoCategoryLabel(photo.category)}</p>
        </div>
        <div>
          <p className="label-caps text-ink-2">Zone</p>
          <p className="text-body text-ink">{photo.zoneLabel ?? "Sans zone"}</p>
        </div>
      </div>
      {photo.isCover ? (
        <p className="inline-flex items-center gap-1.5 text-ui font-semibold text-ink">
          <Star className="size-4 fill-current text-brand" aria-hidden="true" />
          Photo de garde
        </p>
      ) : null}
      <Meta photo={photo} />
    </>
  );
}

function EditPanel({
  photo,
  marker,
  reserves,
  zones,
  isFirst,
  isLast,
  onUpdate,
  onSetCover,
  onMove,
  onDelete,
}: {
  photo: PhotoView;
  marker: PhotoMarkerLink | null;
  reserves: PhotoReserveMention[];
  zones: ZoneOption[];
  isFirst: boolean;
  isLast: boolean;
  onUpdate: PhotoViewerProps["onUpdate"];
  onSetCover: PhotoViewerProps["onSetCover"];
  onMove: PhotoViewerProps["onMove"];
  onDelete: PhotoViewerProps["onDelete"];
}) {
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [captionStatus, setCaptionStatus] = useState<CaptionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(photo.caption ?? "");

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function saveCaption(value: string) {
    if (value.trim() === lastSaved.current.trim()) {
      setCaptionStatus(value === "" && lastSaved.current === "" ? "idle" : "saved");
      return;
    }
    setCaptionStatus("saving");
    const message = await onUpdate(photo.id, { caption: value });
    if (message) {
      setCaptionStatus("error");
      setError(message);
    } else {
      lastSaved.current = value;
      setCaptionStatus("saved");
      setError(null);
    }
  }

  function changeCaption(value: string) {
    setCaption(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveCaption(value), CAPTION_DEBOUNCE_MS);
  }

  function flushCaption() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      void saveCaption(caption);
    }
  }

  async function run(operation: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    try {
      const message = await operation();
      if (message) setError(message);
      return message;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <MarkerMention marker={marker} />
      <Field
        id={`caption-${photo.id}`}
        label="Légende"
        hint={
          <span data-testid="caption-status" className="flex justify-between gap-2">
            <span>
              {captionStatus === "saving"
                ? "Enregistrement…"
                : captionStatus === "saved"
                  ? "Enregistrée"
                  : captionStatus === "error"
                    ? "Erreur, réessayez"
                    : "Enregistrement automatique."}
            </span>
            {caption.length >= PHOTO_CAPTION_MAX_LENGTH - 50 ? (
              <span>
                {caption.length} / {PHOTO_CAPTION_MAX_LENGTH}
              </span>
            ) : null}
          </span>
        }
      >
        {(control) => (
          <Textarea
            {...control}
            value={caption}
            rows={3}
            maxLength={PHOTO_CAPTION_MAX_LENGTH}
            placeholder="Décrivez ce que montre la photo."
            onChange={(event) => changeCaption(event.target.value)}
            onBlur={flushCaption}
            data-testid="caption-input"
          />
        )}
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <Field id={`category-${photo.id}`} label="Catégorie">
          {(control) => (
            <Select
              {...control}
              value={photo.category}
              disabled={busy}
              onChange={(event) =>
                void run(() =>
                  onUpdate(photo.id, { category: event.target.value as PhotoCategory }),
                )
              }
              data-testid="category-select"
            >
              {PHOTO_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {PHOTO_CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id={`zone-${photo.id}`} label="Zone">
          {(control) => (
            <Select
              {...control}
              value={photo.zoneKey ?? ""}
              disabled={busy}
              onChange={(event) =>
                void run(() => onUpdate(photo.id, { zoneKey: event.target.value || null }))
              }
              data-testid="zone-select"
            >
              <option value="">Sans zone</option>
              {zones.map((zone) => (
                <option key={zone.key} value={zone.key}>
                  {zone.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {error ? (
        <p role="alert" className="text-ui font-medium text-status-open">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || photo.isCover}
          onClick={(event) => {
            // The button is disabled once the photo is the cover: a disabled element keeps
            // the focus but receives no key, so Escape would stop closing the viewer.
            event.currentTarget.blur();
            void run(() => onSetCover(photo.id));
          }}
          data-testid="set-cover"
        >
          <Star
            className={cn("size-5", photo.isCover && "fill-current text-brand")}
            aria-hidden="true"
          />
          {photo.isCover ? "Photo de garde" : "Définir comme photo de garde"}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy || isFirst}
            onClick={(event) => {
              event.currentTarget.blur();
              void run(() => onMove(photo.id, "before"));
            }}
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
            Déplacer avant
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || isLast}
            onClick={(event) => {
              event.currentTarget.blur();
              void run(() => onMove(photo.id, "after"));
            }}
          >
            Déplacer après
            <ArrowRight className="size-5" aria-hidden="true" />
          </Button>
        </div>
        <Button
          type="button"
          variant="danger"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
          data-testid="delete-photo"
        >
          <Trash2 className="size-5" aria-hidden="true" />
          Supprimer
        </Button>
      </div>
      <Meta photo={photo} />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent data-testid="delete-photo-dialog">
          <DialogHeader>
            <DialogTitle>Supprimer cette photo ?</DialogTitle>
            <DialogDescription>
              La photo et sa miniature seront effacées du stockage. Cette action est tracée et ne
              peut pas être annulée.
              {marker
                ? ` Le repère n° ${marker.number} sur « ${marker.planName} » restera, sans photo.`
                : ""}
              {reserves.length > 0
                ? ` Elle illustre ${reserves.length > 1 ? "les réserves" : "la réserve"} ${reserves.map((r) => r.code).join(", ")} : ${reserves.length > 1 ? "elles resteront" : "elle restera"}, sans cette photo.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="danger"
              loading={busy}
              onClick={() =>
                void run(() => onDelete(photo.id)).then((message) => {
                  if (!message) setConfirmDelete(false);
                })
              }
              data-testid="confirm-delete-photo"
            >
              Supprimer la photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
