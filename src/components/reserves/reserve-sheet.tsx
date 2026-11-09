"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Check, ChevronDown, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";

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
import { Textarea } from "@/components/ui/textarea";
import { useUploadQueue } from "@/components/visits/photos/upload-queue-provider";
import { cn } from "@/lib/cn";
import { formatDate, todayInParis } from "@/lib/format";
import { applyDueShortcut, DUE_SHORTCUTS, isPastDate } from "@/lib/reserves/dates";
import {
  emptyReserveForm,
  RESERVE_ACTION_MAX,
  reserveFormSchema,
  type ReserveFormValues,
  reserveToForm,
  type ResponsibleMode,
} from "@/lib/reserves/schema";
import { useOffline } from "@/components/offline/offline-provider";
import { useOptionalVisit } from "@/components/offline/visit-data";
import { useVisitMutations } from "@/components/offline/visit-mutations";
import type { ConflictEntry } from "@/lib/offline/db";
import { responsibleSuggestionsAction } from "@/server/actions/reserve-actions";
import { RESERVE_PRIORITIES, RESERVE_PRIORITY_LABELS } from "@/server/domain/enums";
import type { PhotoView } from "@/server/photos/types";
import type { ReserveDetail, ResponsibleSuggestions } from "@/server/reserves/types";

/** What the sheet edits: a new reserve (with defaults) or an existing one. */
export type ReserveSheetTarget =
  | { kind: "create"; zoneKey: string | null; photoIds?: string[] }
  | { kind: "edit"; reserve: ReserveDetail };

/** A saved reserve: « R-? » while it waits for the server (`queued`). */
export interface SavedReserve {
  id: string;
  code: string;
  action: string;
  queued: boolean;
}

export interface ReserveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ReserveSheetTarget;
  visitId: string;
  siteId: string;
  zones: Array<{ key: string; label: string }>;
  /** Ready photos of the visit, offered as defect photos. */
  photos: PhotoView[];
  /** Called after each successful save. `again`: « Enregistrer et nouvelle ». */
  onSaved: (reserve: SavedReserve, options: { again: boolean }) => void;
}

const RESPONSIBLE_OPTIONS: Array<{ value: ResponsibleMode; label: string }> = [
  { value: "internal", label: "Interne" },
  { value: "external", label: "Entreprise extérieure" },
  { value: "none", label: "À désigner" },
];

function initialValues(target: ReserveSheetTarget): ReserveFormValues {
  if (target.kind === "edit") {
    return reserveToForm({
      ...target.reserve,
      photoIds: target.reserve.photos.map((photo) => photo.id),
    });
  }
  return { ...emptyReserveForm(target.zoneKey), photoIds: target.photoIds ?? [] };
}

/**
 * Sheet to create or edit a reserve: side panel from 1024 px, full screen below. Fields in
 * order: action (required, focused), zone, priority (four segments), due date (shortcuts,
 * date picker, « Aucune »; a past date asks for a confirmation), responsible (internal search,
 * external company with the site's suggestions, or « À désigner »), defect photos (grid
 * filtered by zone, « Prendre une photo » linked once the upload is confirmed) and the
 * collapsed description. « Enregistrer » and « Enregistrer et nouvelle » (creation). An edit
 * sends the known version; a conflict keeps the input and shows the current version.
 */
export function ReserveSheet({
  open,
  onOpenChange,
  target,
  visitId,
  siteId,
  zones,
  photos,
  onSaved,
}: ReserveSheetProps) {
  const id = useId();
  const editing = target.kind === "edit" ? target.reserve : null;
  const form = useForm<ReserveFormValues>({
    resolver: zodResolver(reserveFormSchema),
    defaultValues: initialValues(target),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = form;
  const [serverError, setServerError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    current: ReserveDetail;
    message: string;
    entry: ConflictEntry;
  } | null>(null);
  const { engine, online } = useOffline();
  const visitData = useOptionalVisit();
  const mutations = useVisitMutations(visitId);
  const [pastConfirm, setPastConfirm] = useState<{ again: boolean } | null>(null);
  const [descriptionOpen, setDescriptionOpen] = useState(Boolean(editing?.description));
  const [suggestions, setSuggestions] = useState<ResponsibleSuggestions | null>(null);
  const [profileQuery, setProfileQuery] = useState("");
  const [photoZone, setPhotoZone] = useState<string | null>(null);
  const confirmedPast = useRef<string | null>(editing?.dueDate ?? null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const { enqueue, uploaded } = useUploadQueue();
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  // « Enregistrer et nouvelle »: focus the action once the submission is over (the disabled
  // button would otherwise take the focus back).
  const [refocus, setRefocus] = useState(0);

  const zoneKey = watch("zoneKey");
  const priority = watch("priority");
  const dueDate = watch("dueDate");
  const responsibleMode = watch("responsibleMode");
  const profileId = watch("responsibleProfileId");
  const photoIds = watch("photoIds");
  const action = watch("action");

  // Reset when the sheet opens on another target.
  const targetKey = target.kind === "edit" ? `edit-${target.reserve.id}` : "create";
  useEffect(() => {
    if (!open) return;
    reset(initialValues(target));
    setConflict(null);
    setServerError(null);
    setPhotoZone(null);
    setDescriptionOpen(target.kind === "edit" && Boolean(target.reserve.description));
    confirmedPast.current = target.kind === "edit" ? target.reserve.dueDate : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset per opening and target
  }, [open, targetKey]);

  useEffect(() => {
    if (!open || suggestions) return;
    let cancelled = false;
    // Offline: the colleagues known by the local copy, no company suggestion.
    const fallback = () => {
      if (!cancelled) {
        setSuggestions({
          internal: (visitData?.visit.writers ?? []).map((w) => ({
            id: w.id,
            fullName: w.fullName,
          })),
          external: [],
        });
      }
    };
    if (!online) {
      fallback();
      return;
    }
    void responsibleSuggestionsAction({ siteId })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setSuggestions(result.suggestions);
        else fallback();
      })
      .catch(fallback);
    return () => {
      cancelled = true;
    };
  }, [open, siteId, suggestions, online, visitData?.visit.writers]);

  // A photo taken from the sheet is selected as soon as the queue confirms it.
  useEffect(() => {
    if (waitingSince === null || uploaded.length <= waitingSince) return;
    const added = uploaded.slice(waitingSince).map((photo) => photo.id);
    setWaitingSince(null);
    setValue("photoIds", [...new Set([...form.getValues("photoIds"), ...added])], {
      shouldDirty: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to new uploads only
  }, [uploaded]);

  useEffect(() => {
    if (refocus > 0 && !isSubmitting) setFocus("action");
  }, [refocus, isSubmitting, setFocus]);

  const allPhotos = useMemo(() => {
    const known = new Set(photos.map((photo) => photo.id));
    return [...photos, ...uploaded.filter((photo) => !known.has(photo.id))];
  }, [photos, uploaded]);
  const filterZone = photoZone ?? (zoneKey || "");
  const photoChoices = allPhotos.filter((photo) =>
    filterZone === ""
      ? true
      : filterZone === "sans"
        ? !photo.zoneKey
        : photo.zoneKey === filterZone,
  );
  const selectedOutside = photoIds.filter((pid) => !photoChoices.some((p) => p.id === pid));

  const profiles = suggestions?.internal ?? [];
  const selectedProfile = profiles.find((p) => p.id === profileId) ?? null;
  const editingProfileName =
    editing && editing.responsibleProfileId === profileId ? editing.responsibleLabel : null;
  const query = profileQuery.trim().toLocaleLowerCase("fr");
  const profileMatches = query
    ? profiles.filter((p) => p.fullName.toLocaleLowerCase("fr").includes(query)).slice(0, 6)
    : profiles.slice(0, 6);

  function togglePhoto(photoId: string) {
    const current = form.getValues("photoIds");
    setValue(
      "photoIds",
      current.includes(photoId) ? current.filter((x) => x !== photoId) : [...current, photoId],
      { shouldDirty: true },
    );
  }

  function savedFrom(
    result: { queued: boolean; data: Record<string, unknown>; id?: string },
    values: ReserveFormValues,
  ): SavedReserve {
    const server = result.data.reserve as ReserveDetail | undefined;
    return {
      id: server?.id ?? result.id ?? editing?.id ?? "",
      code: server?.code ?? editing?.code ?? "R-?",
      action: server?.action ?? values.action,
      queued: result.queued,
    };
  }

  async function persist(values: ReserveFormValues, again: boolean) {
    setServerError(null);
    if (editing) {
      const result = await mutations.updateReserve(editing.id, values, editing.code);
      if (result.ok) {
        setConflict(null);
        onSaved(savedFrom(result, values), { again: false });
        return;
      }
      if (result.conflict) {
        const current = (result.conflict.theirs as { reserve?: ReserveDetail }).reserve;
        if (current) {
          setConflict({ current, message: result.error, entry: result.conflict });
          return;
        }
      }
      setServerError(result.error);
      return;
    }
    const result = await mutations.createReserve(values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    onSaved(savedFrom(result, values), { again });
    if (again) {
      // Next reserve: same zone, every other field back to its default (priority « Normale »).
      reset(emptyReserveForm(values.zoneKey || null));
      confirmedPast.current = null;
      setDescriptionOpen(false);
      setRefocus((n) => n + 1);
    }
  }

  function submit(again: boolean) {
    return handleSubmit(async (values) => {
      if (
        values.dueDate &&
        isPastDate(values.dueDate, todayInParis()) &&
        confirmedPast.current !== values.dueDate
      ) {
        setPastConfirm({ again });
        return;
      }
      await persist(values, again);
    });
  }

  const uploading = waitingSince !== null;
  const title = editing ? `Modifier ${editing.code}` : "Nouvelle réserve";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          hideCloseButton
          aria-describedby={undefined}
          className={cn(
            "top-0 left-0 h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none p-0",
            "lg:right-0 lg:left-auto lg:w-[32rem] lg:rounded-l-xl",
            "motion-safe:data-[state=open]:animate-sheet-in",
          )}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            setFocus("action");
          }}
          data-testid="reserve-sheet"
        >
          <form
            className="flex h-full flex-col"
            onSubmit={(event) => void submit(false)(event)}
            noValidate
          >
            <header className="flex items-center justify-between gap-2 border-b border-rule px-4 py-3">
              <DialogTitle className="font-display text-title-sm text-ink">{title}</DialogTitle>
              <DialogClose asChild>
                <Button type="button" variant="ghost" aria-label="Fermer sans enregistrer">
                  <X className="size-5" aria-hidden="true" />
                </Button>
              </DialogClose>
            </header>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
              {conflict ? (
                <section
                  role="alert"
                  className="flex flex-col gap-2 rounded-md border border-status-progress-dot bg-status-progress-bg p-3 text-ui text-ink"
                  data-testid="reserve-conflict"
                >
                  <p className="font-semibold">{conflict.message}</p>
                  <p>
                    Version actuelle : « {conflict.current.action} » ·{" "}
                    {RESERVE_PRIORITY_LABELS[conflict.current.priority]} · échéance{" "}
                    {conflict.current.dueDate ? formatDate(conflict.current.dueDate) : "aucune"} ·{" "}
                    {conflict.current.responsibleLabel ?? "À désigner"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() =>
                        void handleSubmit(async (values) => {
                          if (!engine || !editing) return;
                          const resolved = await engine.resolveConflict(conflict.entry, {
                            visitId,
                            kind: "reserve.update",
                            entityId: editing.id,
                            payload: { id: editing.id, values },
                            baseVersion: conflict.entry.serverVersion,
                            versionScope: `reserve:${editing.id}`,
                            label: conflict.entry.label,
                          });
                          const outcome = await resolved?.wait();
                          if (outcome?.status === "conflict") {
                            const current = (outcome.conflict.theirs as { reserve?: ReserveDetail })
                              .reserve;
                            if (current) {
                              setConflict({
                                current,
                                message: outcome.conflict.message,
                                entry: outcome.conflict,
                              });
                            }
                            return;
                          }
                          if (outcome?.status === "rejected") {
                            setServerError(outcome.message);
                            return;
                          }
                          setConflict(null);
                          onSaved(
                            {
                              id: editing.id,
                              code: conflict.current.code,
                              action: values.action,
                              queued: outcome?.status !== "applied",
                            },
                            { again: false },
                          );
                        })()
                      }
                      data-testid="reserve-conflict-keep"
                    >
                      Enregistrer ma saisie
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        reset(
                          reserveToForm({
                            ...conflict.current,
                            photoIds: conflict.current.photos.map((p) => p.id),
                          }),
                        );
                        void engine?.resolveConflict(conflict.entry, null);
                        setConflict(null);
                      }}
                    >
                      Reprendre la version actuelle
                    </Button>
                  </div>
                </section>
              ) : null}
              {serverError ? <ErrorNotice message={serverError} /> : null}

              <Field
                id={`${id}-action`}
                label="Action à mener"
                required
                error={errors.action?.message}
                hint={`${action.length} / ${RESERVE_ACTION_MAX}`}
              >
                {(controlProps) => (
                  <Textarea
                    {...controlProps}
                    {...register("action")}
                    rows={3}
                    maxLength={RESERVE_ACTION_MAX + 50}
                    placeholder="Ex. : remplacer les butoirs du quai 14"
                    data-testid="reserve-action"
                  />
                )}
              </Field>

              <Field id={`${id}-zone`} label="Zone" error={errors.zoneKey?.message}>
                {(controlProps) => (
                  <Select {...controlProps} {...register("zoneKey")} data-testid="reserve-zone">
                    <option value="">Sans zone</option>
                    {zones.map((zone) => (
                      <option key={zone.key} value={zone.key}>
                        {zone.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-ui font-semibold text-ink">Priorité</legend>
                <div
                  role="radiogroup"
                  aria-label="Priorité"
                  className="grid grid-cols-4 gap-1 rounded-md bg-galet p-1"
                >
                  {RESERVE_PRIORITIES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={priority === value}
                      onClick={() => setValue("priority", value, { shouldDirty: true })}
                      className={cn(
                        "min-h-11 rounded-sm px-1 text-ui font-semibold",
                        "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
                        priority === value
                          ? "bg-paper text-ink shadow-raised"
                          : "text-ink-2 hover:text-ink",
                      )}
                      data-testid={`reserve-priority-${value}`}
                    >
                      {RESERVE_PRIORITY_LABELS[value]}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-ui font-semibold text-ink">Échéance</legend>
                <div className="flex flex-wrap gap-2">
                  {DUE_SHORTCUTS.map((shortcut) => (
                    <Button
                      key={shortcut.key}
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setValue("dueDate", applyDueShortcut(todayInParis(), shortcut.key), {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                      data-testid={`reserve-due-${shortcut.key}`}
                    >
                      {shortcut.label}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant={dueDate === "" ? "primary" : "secondary"}
                    aria-pressed={dueDate === ""}
                    onClick={() => setValue("dueDate", "", { shouldDirty: true })}
                  >
                    Aucune
                  </Button>
                </div>
                <Field id={`${id}-due`} label="Date d'échéance" error={errors.dueDate?.message}>
                  {(controlProps) => (
                    <Input
                      {...controlProps}
                      {...register("dueDate")}
                      type="date"
                      data-testid="reserve-due-date"
                    />
                  )}
                </Field>
              </fieldset>

              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1.5 text-ui font-semibold text-ink">Responsable</legend>
                <div
                  role="radiogroup"
                  aria-label="Responsable"
                  className="grid grid-cols-3 gap-1 rounded-md bg-galet p-1"
                >
                  {RESPONSIBLE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={responsibleMode === option.value}
                      onClick={() =>
                        setValue("responsibleMode", option.value, { shouldDirty: true })
                      }
                      className={cn(
                        "min-h-11 rounded-sm px-1 text-ui leading-tight font-semibold",
                        "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
                        responsibleMode === option.value
                          ? "bg-paper text-ink shadow-raised"
                          : "text-ink-2 hover:text-ink",
                      )}
                      data-testid={`reserve-responsible-${option.value}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {responsibleMode === "internal" ? (
                  <div className="flex flex-col gap-2">
                    {profileId ? (
                      <p className="flex min-h-11 items-center gap-2 text-body text-ink">
                        <Check className="size-4 text-ink-2" aria-hidden="true" />
                        <span data-testid="reserve-internal-selected">
                          {selectedProfile?.fullName ?? editingProfileName ?? "Compte inconnu"}
                          {editing?.responsibleInactive &&
                          editing.responsibleProfileId === profileId ? (
                            <span className="text-ink-2"> (inactif)</span>
                          ) : null}
                        </span>
                      </p>
                    ) : null}
                    <Field
                      id={`${id}-profile`}
                      label="Rechercher une personne"
                      error={errors.responsibleProfileId?.message}
                    >
                      {(controlProps) => (
                        <Input
                          {...controlProps}
                          value={profileQuery}
                          onChange={(event) => setProfileQuery(event.target.value)}
                          placeholder="Nom"
                          autoComplete="off"
                          data-testid="reserve-profile-search"
                        />
                      )}
                    </Field>
                    <ul className="flex flex-col gap-1" aria-label="Personnes">
                      {profileMatches.map((profile) => (
                        <li key={profile.id}>
                          <button
                            type="button"
                            aria-pressed={profile.id === profileId}
                            onClick={() =>
                              setValue("responsibleProfileId", profile.id, {
                                shouldDirty: true,
                                shouldValidate: true,
                              })
                            }
                            className={cn(
                              "flex min-h-11 w-full items-center rounded-md px-3 text-left text-ui",
                              "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
                              profile.id === profileId
                                ? "bg-brand-soft font-semibold text-brand-deep"
                                : "hover:bg-craie",
                            )}
                            data-testid="reserve-profile-option"
                          >
                            {profile.fullName}
                          </button>
                        </li>
                      ))}
                      {suggestions && profileMatches.length === 0 ? (
                        <li className="text-ui text-ink-2 italic">Aucune personne trouvée.</li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}

                {responsibleMode === "external" ? (
                  <div className="flex flex-col gap-3">
                    {suggestions && suggestions.external.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-ui text-ink-2">Déjà intervenus sur ce site</p>
                        <ul className="flex flex-wrap gap-2">
                          {suggestions.external.map((pair) => (
                            <li key={`${pair.company ?? ""}-${pair.name}`}>
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => {
                                  setValue("responsibleCompany", pair.company ?? "", {
                                    shouldDirty: true,
                                  });
                                  setValue("responsibleName", pair.name, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  });
                                }}
                                data-testid="reserve-external-suggestion"
                              >
                                {[pair.name, pair.company].filter(Boolean).join(" · ")}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <Field
                      id={`${id}-company`}
                      label="Entreprise"
                      error={errors.responsibleCompany?.message}
                    >
                      {(controlProps) => (
                        <Input
                          {...controlProps}
                          {...register("responsibleCompany")}
                          autoComplete="organization"
                          data-testid="reserve-company"
                        />
                      )}
                    </Field>
                    <Field
                      id={`${id}-name`}
                      label="Nom du contact"
                      required
                      error={errors.responsibleName?.message}
                    >
                      {(controlProps) => (
                        <Input
                          {...controlProps}
                          {...register("responsibleName")}
                          autoComplete="name"
                          data-testid="reserve-name"
                        />
                      )}
                    </Field>
                    <Field
                      id={`${id}-email`}
                      label="E-mail (facultatif)"
                      error={errors.responsibleEmail?.message}
                    >
                      {(controlProps) => (
                        <Input
                          {...controlProps}
                          {...register("responsibleEmail")}
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          data-testid="reserve-email"
                        />
                      )}
                    </Field>
                  </div>
                ) : null}
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-ui font-semibold text-ink">Photos du défaut</legend>
                <div className="flex flex-wrap items-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={uploading}
                    onClick={() => cameraRef.current?.click()}
                    data-testid="reserve-take-photo"
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
                    data-testid="reserve-photo-input"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      event.target.value = "";
                      if (files.length === 0) return;
                      setWaitingSince(uploaded.length);
                      enqueue(files, { zoneKey: zoneKey || null });
                    }}
                  />
                  {allPhotos.length > 0 ? (
                    <Field id={`${id}-photo-zone`} label="Zone des photos" className="min-w-40">
                      {(controlProps) => (
                        <Select
                          {...controlProps}
                          value={filterZone}
                          onChange={(event) => setPhotoZone(event.target.value)}
                        >
                          <option value="">Toutes les zones</option>
                          {zones.map((zone) => (
                            <option key={zone.key} value={zone.key}>
                              {zone.label}
                            </option>
                          ))}
                          <option value="sans">Sans zone</option>
                        </Select>
                      )}
                    </Field>
                  ) : null}
                </div>
                {uploading ? (
                  <p className="text-ui text-ink-2" role="status">
                    Envoi de la photo… elle sera liée à la réserve dès qu&apos;elle sera
                    enregistrée.
                  </p>
                ) : null}
                <p className="text-ui text-ink-2" aria-live="polite">
                  {photoIds.length === 0
                    ? "Aucune photo choisie."
                    : `${photoIds.length} photo${photoIds.length > 1 ? "s" : ""} choisie${photoIds.length > 1 ? "s" : ""}${selectedOutside.length > 0 ? ` (dont ${selectedOutside.length} hors de ce filtre)` : ""}.`}
                </p>
                {photoChoices.length > 0 ? (
                  <ul
                    className="grid grid-cols-3 gap-2 sm:grid-cols-4"
                    data-testid="reserve-photos"
                  >
                    {photoChoices.map((photo) => {
                      const selected = photoIds.includes(photo.id);
                      return (
                        <li key={photo.id}>
                          <button
                            type="button"
                            aria-pressed={selected}
                            aria-label={`Photo : ${photo.caption ?? "Sans légende"}`}
                            onClick={() => togglePhoto(photo.id)}
                            className={cn(
                              "relative block aspect-[4/3] w-full overflow-hidden rounded-md border-2 bg-galet",
                              "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
                              selected ? "border-brand" : "border-transparent hover:border-rule",
                            )}
                            data-testid="reserve-photo-choice"
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
                            {selected ? (
                              <span className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-pill bg-brand text-on-brand">
                                <Check className="size-4" aria-hidden="true" />
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : allPhotos.length > 0 ? (
                  <p className="text-ui text-ink-2 italic">Aucune photo dans cette zone.</p>
                ) : null}
                {errors.photoIds ? (
                  <p role="alert" className="text-ui font-medium text-status-open">
                    {errors.photoIds.message}
                  </p>
                ) : null}
              </fieldset>

              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="self-start px-2"
                  aria-expanded={descriptionOpen}
                  aria-controls={`${id}-description-panel`}
                  onClick={() => setDescriptionOpen((value) => !value)}
                >
                  <ChevronDown
                    className={cn("size-4 transition-transform", descriptionOpen && "rotate-180")}
                    aria-hidden="true"
                  />
                  Description
                </Button>
                <div id={`${id}-description-panel`} hidden={!descriptionOpen}>
                  <Field
                    id={`${id}-description`}
                    label="Description détaillée"
                    error={errors.description?.message}
                  >
                    {(controlProps) => (
                      <Textarea {...controlProps} {...register("description")} rows={4} />
                    )}
                  </Field>
                </div>
              </div>
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-rule px-4 py-3 sm:flex-row sm:justify-end">
              {editing ? null : (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  loading={isSubmitting}
                  disabled={uploading}
                  onClick={() => void submit(true)()}
                  data-testid="reserve-save-again"
                >
                  Enregistrer et nouvelle
                </Button>
              )}
              <Button
                type="submit"
                size="lg"
                loading={isSubmitting}
                disabled={uploading}
                data-testid="reserve-save"
              >
                Enregistrer
              </Button>
            </footer>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={pastConfirm !== null} onOpenChange={(value) => !value && setPastConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Échéance déjà passée</DialogTitle>
            <DialogDescription>
              Le {dueDate ? formatDate(dueDate) : ""} est passé : la réserve sera aussitôt en
              retard. Garder cette date ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Changer la date
              </Button>
            </DialogClose>
            <Button
              type="button"
              data-testid="reserve-past-confirm"
              onClick={() => {
                const again = pastConfirm?.again ?? false;
                confirmedPast.current = form.getValues("dueDate");
                setPastConfirm(null);
                void handleSubmit((values) => persist(values, again))();
              }}
            >
              Garder cette date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
