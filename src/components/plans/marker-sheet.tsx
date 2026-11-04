"use client";

import { Camera, ImageMinus, Move, Trash2, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { ErrorNotice } from "@/components/auth/error-notice";
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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useUploadQueue } from "@/components/visits/photos/upload-queue-provider";
import { cn } from "@/lib/cn";
import { MARKER_LABEL_MAX_LENGTH } from "@/server/domain/plans";
import type { PhotoView } from "@/server/photos/types";
import type { MarkerView } from "@/server/plans/types";

export interface MarkerSheetProps {
  marker: MarkerView;
  planName: string;
  photos: PhotoView[];
  zones: Array<{ key: string; label: string }>;
  canEdit: boolean;
  /** « Créer une réserve ici »: Reserves tab with the photo prelinked and this marker. */
  createReserveHref?: string;
  moving: boolean;
  onClose: () => void;
  /** Saves a patch; resolves with the error message, or `null`. */
  onUpdate: (patch: { label?: string | null; photoId?: string | null }) => Promise<string | null>;
  onStartMove: () => void;
  onDelete: () => Promise<string | null>;
}

const LABEL_DEBOUNCE_MS = 800;

/**
 * Sheet of a marker: side panel from 1024 px, bottom sheet below. Label (80 characters,
 * autosaved), linked photo (pick among the ready photos of the visit, filtered by zone, or
 * « Prendre une photo », linked as soon as the upload is confirmed), « Retirer la photo »,
 * « Déplacer » (next tap on the plan) and « Supprimer le repère » with a confirmation.
 * Read-only: the same information without controls.
 * « Créer une réserve ici » opens the reserve sheet with the linked photo; the marker then
 * becomes the reserve's marker.
 */
export function MarkerSheet({
  marker,
  planName,
  photos,
  zones,
  canEdit,
  createReserveHref,
  moving,
  onClose,
  onUpdate,
  onStartMove,
  onDelete,
}: MarkerSheetProps) {
  const id = useId();
  const [label, setLabel] = useState(marker.label ?? "");
  const [labelStatus, setLabelStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [zone, setZone] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(marker.label ?? "");
  const cameraRef = useRef<HTMLInputElement>(null);
  const { enqueue, uploaded } = useUploadQueue();
  const waitingSince = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // A photo taken from the sheet is linked as soon as the queue confirms it.
  useEffect(() => {
    const since = waitingSince.current;
    if (since === null || uploaded.length <= since) return;
    const photo = uploaded[since];
    waitingSince.current = null;
    if (photo) void save({ photoId: photo.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to new uploads only
  }, [uploaded]);

  async function save(
    patch: { label?: string | null; photoId?: string | null },
    options: { quiet?: boolean } = {},
  ) {
    // Label saves are quiet: they run on blur, right before a click on a photo or a button,
    // and must not disable that control under the pointer.
    if (!options.quiet) setBusy(true);
    setError(null);
    const message = await onUpdate(patch);
    if (!options.quiet) setBusy(false);
    if (message) setError(message);
    return message;
  }

  function changeLabel(value: string) {
    setLabel(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushLabel(value), LABEL_DEBOUNCE_MS);
  }

  async function flushLabel(value = label) {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (value.trim() === lastSaved.current.trim()) return;
    setLabelStatus("saving");
    const message = await save({ label: value.trim() === "" ? null : value }, { quiet: true });
    if (!message) {
      lastSaved.current = value;
      setLabelStatus("saved");
    } else {
      setLabelStatus("idle");
    }
  }

  const linked = marker.photoId ? (photos.find((p) => p.id === marker.photoId) ?? null) : null;
  const choices = photos.filter((photo) =>
    zone === "" ? true : zone === "sans" ? !photo.zoneKey : photo.zoneKey === zone,
  );

  return (
    <aside
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex max-h-[55dvh] flex-col gap-4 overflow-y-auto rounded-t-xl border-t border-rule bg-paper p-4 shadow-raised",
        "lg:static lg:z-auto lg:max-h-none lg:rounded-xl lg:border lg:shadow-none",
      )}
      aria-labelledby={`${id}-title`}
      data-testid="marker-sheet"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="font-display text-title-sm text-ink">
            Repère n° {marker.number}
          </h3>
          <p className="truncate text-ui text-ink-2">
            {planName} · page {marker.page}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          aria-label="Fermer la feuille du repère"
        >
          <X className="size-5" aria-hidden="true" />
        </Button>
      </div>

      {canEdit ? (
        <Field
          id={`${id}-label`}
          label="Libellé"
          hint={
            labelStatus === "saving"
              ? "Enregistrement…"
              : labelStatus === "saved"
                ? "Enregistré"
                : "Optionnel, 80 caractères."
          }
        >
          {(control) => (
            <Input
              {...control}
              value={label}
              maxLength={MARKER_LABEL_MAX_LENGTH}
              placeholder="Ex. : butoir quai 14"
              onChange={(event) => changeLabel(event.target.value)}
              onBlur={() => void flushLabel()}
              onKeyDown={(event) => {
                if (event.key === "Enter") void flushLabel();
              }}
              data-testid="marker-label-input"
            />
          )}
        </Field>
      ) : (
        <p className={cn("text-body", marker.label ? "text-ink" : "text-ink-2 italic")}>
          {marker.label ?? "Sans libellé"}
        </p>
      )}

      <section aria-label="Photo liée" className="flex flex-col gap-2">
        <p className="label-caps text-ink-2">Photo</p>
        {marker.photoId ? (
          <div className="flex items-center gap-3">
            {marker.photoThumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL
              <img
                src={marker.photoThumbUrl}
                alt=""
                width={96}
                height={72}
                className="h-18 w-24 rounded-md object-cover"
                data-testid="marker-photo-thumb"
              />
            ) : null}
            <div className="flex min-w-0 flex-col gap-1">
              <p className="truncate text-ui text-ink">
                {marker.photoCaption ?? linked?.caption ?? "Sans légende"}
              </p>
              <Link
                href={`?onglet=photos&photo=${marker.photoId}`}
                className="inline-flex min-h-11 items-center font-semibold text-brand-deep underline"
                data-testid="marker-view-photo"
              >
                Voir la photo
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-ui text-ink-2 italic">Aucune photo liée.</p>
        )}

        {canEdit ? (
          <>
            <div className="flex flex-wrap gap-2">
              {marker.photoId ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void save({ photoId: null })}
                >
                  <ImageMinus className="size-4" aria-hidden="true" />
                  Retirer la photo
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                disabled={busy || waitingSince.current !== null}
                onClick={() => cameraRef.current?.click()}
                data-testid="marker-take-photo"
              >
                <Camera className="size-4" aria-hidden="true" />
                Prendre une photo
              </Button>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                data-testid="marker-photo-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  waitingSince.current = uploaded.length;
                  enqueue([file]);
                }}
              />
            </div>
            {waitingSince.current !== null ? (
              <p className="text-ui text-ink-2" role="status">
                Envoi de la photo… elle sera liée au repère dès qu&apos;elle sera enregistrée.
              </p>
            ) : null}
            {photos.length > 0 ? (
              <div className="flex flex-col gap-2">
                <Field id={`${id}-zone`} label="Choisir une photo de la visite">
                  {(control) => (
                    <Select
                      {...control}
                      value={zone}
                      onChange={(event) => setZone(event.target.value)}
                    >
                      <option value="">Toutes les zones</option>
                      {zones.map((z) => (
                        <option key={z.key} value={z.key}>
                          {z.label}
                        </option>
                      ))}
                      <option value="sans">Sans zone</option>
                    </Select>
                  )}
                </Field>
                <ul
                  className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3"
                  data-testid="marker-photo-choices"
                >
                  {choices.map((photo) => (
                    <li key={photo.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void save({ photoId: photo.id })}
                        aria-pressed={photo.id === marker.photoId}
                        aria-label={`Lier la photo : ${photo.caption ?? "Sans légende"}`}
                        className={cn(
                          "block aspect-[4/3] w-full overflow-hidden rounded-md border-2 bg-galet",
                          "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
                          photo.id === marker.photoId
                            ? "border-brand"
                            : "border-transparent hover:border-rule",
                        )}
                        data-testid="marker-photo-choice"
                      >
                        {photo.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- signed URL
                          <img
                            src={photo.thumbUrl}
                            alt=""
                            loading="lazy"
                            width={120}
                            height={90}
                            className="size-full object-cover"
                          />
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
                {choices.length === 0 ? (
                  <p className="text-ui text-ink-2">Aucune photo pour ce filtre.</p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {error ? <ErrorNotice message={error} /> : null}

      {canEdit && createReserveHref ? (
        <Button asChild variant="secondary" className="self-start">
          <Link href={createReserveHref} scroll={false} data-testid="marker-create-reserve">
            <TriangleAlert className="size-4" aria-hidden="true" />
            Créer une réserve ici
          </Link>
        </Button>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap gap-2 border-t border-rule pt-3">
          <Button
            type="button"
            variant={moving ? "primary" : "secondary"}
            aria-pressed={moving}
            onClick={onStartMove}
            data-testid="marker-move"
          >
            <Move className="size-4" aria-hidden="true" />
            {moving ? "Touchez la nouvelle position" : "Déplacer"}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => setConfirmDelete(true)}
            data-testid="marker-delete"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Supprimer le repère
          </Button>
        </div>
      ) : null}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent data-testid="marker-delete-dialog">
          <DialogHeader>
            <DialogTitle>Supprimer le repère n° {marker.number} ?</DialogTitle>
            <DialogDescription>
              La photo liée est conservée. Le numéro {marker.number} ne sera pas réattribué.
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
              onClick={async () => {
                setBusy(true);
                const message = await onDelete();
                setBusy(false);
                if (message) setError(message);
                else setConfirmDelete(false);
              }}
              data-testid="marker-confirm-delete"
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
