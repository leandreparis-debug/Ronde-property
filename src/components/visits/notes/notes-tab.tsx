"use client";

import { RefreshCw, Settings2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Galet } from "@/components/brand/Galet";
import { useOffline } from "@/components/offline/offline-provider";
import { useVisit } from "@/components/offline/visit-data";
import { useVisitMutations } from "@/components/offline/visit-mutations";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import type { ConflictEntry } from "@/lib/offline/db";
import { replaceQuery } from "@/lib/offline/query";
import { isZoneFilled, parseNoteContent } from "@/lib/notes/format";
import { cleanZoneLabel, zoneLabelError } from "@/lib/notes/messages";
import type { NoteConflict, NoteSaveStatus } from "@/lib/notes/status";
import type { VisitType } from "@/server/domain/enums";
import { templateForVisitType } from "@/server/domain/templates";
import type { ZoneNoteView } from "@/server/domain/zone-notes";
import type { PhotoView } from "@/server/photos/types";

import { ManageZonesDialog } from "./manage-zones-dialog";
import { NoteConflictDialog } from "./note-conflict-dialog";
import { NoteContent } from "./note-content";
import { type EditorMode, ZoneEditor } from "./zone-editor";
import { ZoneNav } from "./zone-nav";
import { ZonePhotos } from "./zone-photos";
import { ZoneReserves } from "./zone-reserves";

export interface NotesTabProps {
  visitId: string;
  visitType: VisitType;
  canEdit: boolean;
  userId: string;
  /** Photos of the visit, for the per-zone counter and strip. */
  photos: PhotoView[];
  /** Reserves (not deleted) per zone key, open and done, for the zone counter and « + Réserve ». */
  reservesByZone?: Record<string, { open: number; done: number }>;
}

const IDLE: NoteSaveStatus = { kind: "idle" };

/** A copy of `map` without `key`. */
function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  const next = { ...map };
  delete next[key];
  return next;
}
const DEBOUNCE_MS = 800;
const STRUCTURE_CONFLICT =
  "Cette visite a été modifiée entre-temps. Rechargez pour voir la dernière version.";

/** The note conflict of an entry of the store, in the shape of the step 6 dialog. */
function asNoteConflict(entry: ConflictEntry): { mine: string; theirs: NoteConflict } {
  const theirs = entry.theirs as Partial<NoteConflict>;
  return {
    mine: String((entry.mine as { content?: string }).content ?? ""),
    theirs: {
      content: String(theirs.content ?? ""),
      version: Number(theirs.version ?? entry.serverVersion),
      updatedAt: String(theirs.updatedAt ?? entry.createdAt),
      updatedByName: theirs.updatedByName ?? null,
    },
  };
}

/**
 * « Notes » tab: zone selector (list from 1024 px, pills below), editor saved 800 ms after the
 * last keystroke (or at once on blur, zone change, page hidden) **through the outbox**: the text
 * is on the device at once and reaches the server when it can, offline included. Zone
 * management, conflict dialog (« Garder ma version », « Prendre la sienne », « Fusionner ») and
 * the read-only view. The selected zone is reflected in the URL (`?onglet=notes&zone=docks`).
 */
export function NotesTab({
  visitId,
  visitType,
  canEdit,
  userId,
  photos,
  reservesByZone = {},
}: NotesTabProps) {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { online, engine } = useOffline();
  const data = useVisit();
  const mutations = useVisitMutations(visitId);
  const notes = data.notes;

  const [structureConflict, setStructureConflict] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<EditorMode>("edit");
  const [managing, setManaging] = useState(false);
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const save = useCallback(
    async (noteId: string) => {
      const timer = timers.current.get(noteId);
      if (timer) clearTimeout(timer);
      timers.current.delete(noteId);
      const content = draftsRef.current[noteId];
      const note = notesRef.current.find((n) => n.id === noteId);
      if (content === undefined || !note) return;
      if (content === note.content) {
        setDrafts((map) => without(map, noteId));
        return;
      }
      setSaving((map) => ({ ...map, [noteId]: true }));
      setErrors((map) => without(map, noteId));
      // The draft stays until the store shows the same text (effect below): dropping it now
      // would show the previous text for a moment, and a toolbar action would act on it.
      const outcome = await mutations.saveNote(noteId, content, note.zoneLabel);
      setSaving((map) => ({ ...map, [noteId]: false }));
      if (outcome.ok && !outcome.queued) {
        setSaved((map) => ({
          ...map,
          [noteId]: String(outcome.data.savedAt ?? new Date().toISOString()),
        }));
      } else if (!outcome.ok && !outcome.conflict) {
        setErrors((map) => ({ ...map, [noteId]: outcome.error }));
      }
    },
    [mutations],
  );

  // A draft whose text the store now holds (queued or saved) is no longer needed.
  useEffect(() => {
    setDrafts((map) => {
      let next = map;
      for (const [id, value] of Object.entries(map)) {
        if (timers.current.has(id)) continue;
        const note = notes.find((n) => n.id === id);
        if (note && note.content === value) next = without(next, id);
      }
      return next;
    });
  }, [notes]);

  const flushAll = useCallback(() => {
    for (const id of Object.keys(draftsRef.current)) void save(id);
  }, [save]);

  // Leaving the page or hiding the tab saves what is being typed (it is then on the device).
  // Registered once: a re-render must never cancel the pending saves.
  const flushRef = useRef(flushAll);
  flushRef.current = flushAll;
  useEffect(() => {
    const pendingTimers = timers.current;
    const flush = () => flushRef.current();
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
      // Leaving the tab: what is typed goes to the device rather than being dropped.
      for (const timer of pendingTimers.values()) clearTimeout(timer);
      flush();
    };
  }, []);

  const requestedZone = searchParams.get("zone");
  const selected = notes.find((n) => n.zoneKey === requestedZone) ?? notes[0] ?? null;
  const selectedIndex = selected ? notes.findIndex((n) => n.id === selected.id) : -1;

  const selectZone = useCallback(
    (id: string) => {
      const target = notesRef.current.find((n) => n.id === id);
      if (!target) return;
      if (selected && selected.id !== id) void save(selected.id);
      const params = new URLSearchParams(window.location.search);
      params.set("onglet", "notes");
      params.set("zone", target.zoneKey);
      replaceQuery(params);
    },
    [save, selected],
  );

  const valueOf = useCallback((note: ZoneNoteView) => drafts[note.id] ?? note.content, [drafts]);

  function change(noteId: string, value: string) {
    setDrafts((map) => ({ ...map, [noteId]: value }));
    const previous = timers.current.get(noteId);
    if (previous) clearTimeout(previous);
    timers.current.set(
      noteId,
      setTimeout(() => void save(noteId), DEBOUNCE_MS),
    );
  }

  function statusOf(noteId: string): NoteSaveStatus {
    if (errors[noteId]) return { kind: "error", message: errors[noteId]! };
    const waiting = data.outbox.find(
      (entry) => entry.kind === "note.update" && entry.entityId === noteId,
    );
    if (saving[noteId]) {
      if (!online) return { kind: "offline", attempt: 0, deviceOffline: true };
      if (waiting && (waiting.lastError || waiting.attempts > 0)) {
        return { kind: "offline", attempt: waiting.attempts };
      }
      return { kind: "saving" };
    }
    if (waiting) return { kind: "offline", attempt: waiting.attempts, deviceOffline: !online };
    if (saved[noteId]) return { kind: "saved", at: saved[noteId]! };
    return IDLE;
  }

  // A note queued while this page was open and applied later (back online): « Enregistré à ».
  useEffect(() => {
    for (const note of notes) {
      const waiting = data.outbox.some(
        (entry) => entry.kind === "note.update" && entry.entityId === note.id,
      );
      const conflicting = data.conflicts.some((entry) => entry.entityId === note.id);
      if (
        !waiting &&
        !conflicting &&
        saving[note.id] === false &&
        !saved[note.id] &&
        !errors[note.id]
      ) {
        setSaved((map) => ({ ...map, [note.id]: note.updatedAt }));
      }
    }
  }, [notes, data.outbox, data.conflicts, saving, saved, errors]);

  async function structure(
    operation: () => ReturnType<typeof mutations.addZone>,
  ): Promise<string | null> {
    setPending(true);
    try {
      const result = await operation();
      if (result.ok) return null;
      if (result.conflict) {
        setStructureConflict(result.error || STRUCTURE_CONFLICT);
        setManaging(false);
      }
      return result.error;
    } finally {
      setPending(false);
    }
  }

  // Conflict of the selected note (raised here, or found waiting in the store).
  const noteConflict =
    data.conflicts.find(
      (entry) =>
        entry.kind === "note.update" && entry.entityId === selected?.id && entry.id !== dismissed,
    ) ?? null;
  const conflict = noteConflict ? asNoteConflict(noteConflict) : null;

  async function keepMine() {
    if (!noteConflict || !engine || !conflict) return;
    await resolveWith(conflict.mine);
  }

  async function resolveWith(content: string) {
    if (!noteConflict || !engine) return;
    const note = notes.find((n) => n.id === noteConflict.entityId);
    setSaving((map) => ({ ...map, [noteConflict.entityId]: true }));
    const resolved = await engine.resolveConflict(noteConflict, {
      visitId,
      kind: "note.update",
      entityId: noteConflict.entityId,
      payload: { noteId: noteConflict.entityId, content },
      baseVersion: noteConflict.serverVersion,
      versionScope: `note:${noteConflict.entityId}`,
      label: noteConflict.label,
    });
    const outcome = await resolved?.wait();
    setSaving((map) => ({ ...map, [noteConflict.entityId]: false }));
    if (outcome?.status === "applied") {
      setSaved((map) => ({
        ...map,
        [noteConflict.entityId]: String(outcome.data.savedAt ?? note?.updatedAt ?? ""),
      }));
    }
  }

  async function takeTheirs() {
    if (!noteConflict || !engine || !conflict) return;
    const { mine } = conflict;
    setDrafts((map) => without(map, noteConflict.entityId));
    setDismissed(noteConflict.id);
    await engine.resolveConflict(noteConflict, null);
    let copied = false;
    try {
      if (mine.trim() !== "" && navigator.clipboard) {
        await navigator.clipboard.writeText(mine);
        copied = true;
      }
    } catch {
      copied = false;
    }
    toast({
      variant: "info",
      title: copied ? "Votre texte a été copié" : "Sa version a été reprise",
      description: copied ? "Collez-le où vous voulez le conserver." : undefined,
    });
  }

  const template = templateForVisitType(visitType);
  const missingTemplateZones = useMemo(
    () => template.zones.filter((zone) => !notes.some((n) => n.zoneKey === zone.key)),
    [notes, template],
  );
  const navItems = notes.map((note) => ({
    id: note.id,
    zoneKey: note.zoneKey,
    zoneLabel: note.zoneLabel,
    filled: isZoneFilled(valueOf(note)),
    status: statusOf(note.id),
    pending: data.pendingIds.has(note.id),
    photos: photos.filter((photo) => photo.zoneKey === note.zoneKey).length,
  }));

  if (notes.length === 0) {
    return (
      <EmptyState
        mood="asleep"
        title="Aucune zone de notes"
        description={
          canEdit
            ? `Insérez la trame « ${template.name} » pour saisir vos observations zone par zone.`
            : "Cette visite n'a pas encore de notes."
        }
        action={
          canEdit ? (
            <Button
              type="button"
              size="lg"
              loading={pending}
              onClick={() =>
                void structure(() => mutations.insertTemplate(template.key)).then((message) => {
                  if (message) toast({ variant: "error", title: message });
                })
              }
            >
              Insérer la trame {template.name}
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="notes-tab">
      {structureConflict ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-md border border-status-open bg-status-open-bg px-4 py-3 text-ui text-status-open sm:flex-row sm:items-center"
          data-testid="version-conflict"
        >
          <Galet mood="worried" size={32} />
          <span className="flex-1 font-medium">{structureConflict}</span>
          <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Recharger
          </Button>
        </div>
      ) : null}

      {canEdit ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setManaging(true)}
            disabled={Boolean(structureConflict)}
          >
            <Settings2 className="size-5" aria-hidden="true" />
            Gérer les zones
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <ZoneNav items={navItems} selectedId={selected?.id ?? null} onSelect={selectZone} />

        {selected ? (
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {canEdit ? (
              <ZoneEditor
                key={selected.id}
                note={selected}
                value={valueOf(selected)}
                status={statusOf(selected.id)}
                pending={data.pendingIds.has(selected.id)}
                mode={mode}
                userId={userId}
                onModeChange={setMode}
                onChange={(value) => change(selected.id, value)}
                onBlur={() => void save(selected.id)}
                onRetry={() => {
                  setErrors((map) => without(map, selected.id));
                  setDrafts((map) => ({ ...map, [selected.id]: valueOf(selected) }));
                  void save(selected.id);
                }}
                onPrevious={
                  selectedIndex > 0 ? () => selectZone(notes[selectedIndex - 1]!.id) : undefined
                }
                onNext={
                  selectedIndex < notes.length - 1
                    ? () => selectZone(notes[selectedIndex + 1]!.id)
                    : undefined
                }
              />
            ) : (
              <ReadonlyZone
                note={selected}
                onPrevious={
                  selectedIndex > 0 ? () => selectZone(notes[selectedIndex - 1]!.id) : undefined
                }
                onNext={
                  selectedIndex < notes.length - 1
                    ? () => selectZone(notes[selectedIndex + 1]!.id)
                    : undefined
                }
              />
            )}
            <ZonePhotos
              zoneKey={selected.zoneKey}
              photos={photos.filter((photo) => photo.zoneKey === selected.zoneKey)}
              canEdit={canEdit}
            />
            <ZoneReserves
              zoneKey={selected.zoneKey}
              counts={reservesByZone[selected.zoneKey] ?? { open: 0, done: 0 }}
              canEdit={canEdit}
            />
          </div>
        ) : null}
      </div>

      {managing ? (
        <ManageZonesDialog
          zones={navItems}
          missingTemplateZones={missingTemplateZones}
          pending={pending}
          onClose={() => setManaging(false)}
          onMove={(id, delta) => {
            const index = notes.findIndex((n) => n.id === id);
            const target = index + delta;
            if (index < 0 || target < 0 || target >= notes.length) return Promise.resolve(null);
            const ordered = notes.map((n) => n.id);
            ordered.splice(index, 1);
            ordered.splice(target, 0, id);
            return structure(() => mutations.reorderZones(ordered));
          }}
          onRename={async (noteId, label) =>
            zoneLabelError(label, notes, noteId) ??
            structure(() => mutations.renameZone(noteId, cleanZoneLabel(label)))
          }
          onRemove={(noteId) =>
            structure(() =>
              mutations.removeZone(noteId, notes.find((n) => n.id === noteId)?.zoneLabel ?? ""),
            )
          }
          onAdd={async (label) =>
            zoneLabelError(label, notes) ??
            structure(() => mutations.addZone(cleanZoneLabel(label)))
          }
          onAddTemplate={(zoneKey) =>
            structure(() =>
              mutations.addTemplateZone(
                zoneKey,
                template.zones.find((zone) => zone.key === zoneKey)?.label ?? zoneKey,
              ),
            )
          }
        />
      ) : null}

      {conflict && noteConflict ? (
        <NoteConflictDialog
          zoneLabel={notes.find((n) => n.id === noteConflict.entityId)?.zoneLabel ?? ""}
          mine={conflict.mine}
          theirs={conflict.theirs}
          pending={Boolean(saving[noteConflict.entityId])}
          onKeepMine={() => void keepMine()}
          onTakeTheirs={() => void takeTheirs()}
          onMerge={(merged) => void resolveWith(merged)}
        />
      ) : null}
    </div>
  );
}

/** Read-only zone: formatted content, « Aucune observation » when empty. */
function ReadonlyZone({
  note,
  onPrevious,
  onNext,
}: {
  note: ZoneNoteView;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const blocks = parseNoteContent(note.content);
  return (
    <section
      aria-labelledby={`zone-title-${note.id}`}
      className="flex min-w-0 flex-1 flex-col gap-4"
      data-testid="zone-readonly"
    >
      <h3 id={`zone-title-${note.id}`} className="font-display text-title-sm text-ink">
        {note.zoneLabel}
      </h3>
      <div className="rounded-md border border-rule bg-paper px-4 py-3">
        {blocks.length > 0 ? (
          <NoteContent blocks={blocks} />
        ) : (
          <p className="text-body text-ink-2 italic">Aucune observation</p>
        )}
      </div>
      {onPrevious || onNext ? (
        <div className="flex items-center justify-between gap-2 lg:hidden">
          <Button type="button" variant="secondary" onClick={onPrevious} disabled={!onPrevious}>
            Zone précédente
          </Button>
          <Button type="button" variant="secondary" onClick={onNext} disabled={!onNext}>
            Zone suivante
          </Button>
        </div>
      ) : null}
    </section>
  );
}
