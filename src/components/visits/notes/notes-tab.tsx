"use client";

import { RefreshCw, Settings2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Galet } from "@/components/brand/Galet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { isZoneFilled, parseNoteContent } from "@/lib/notes/format";
import {
  createNoteSaver,
  type NoteConflict,
  type NoteSaver,
  type NoteSaveStatus,
} from "@/lib/notes/saver";
import {
  addTemplateZoneAction,
  addZoneAction,
  insertZoneTemplateAction,
  removeZoneAction,
  renameZoneAction,
  reorderZonesAction,
  saveZoneNoteAction,
  type ZoneStructureActionResult,
} from "@/server/actions/zone-note-actions";
import type { VisitType } from "@/server/domain/enums";
import { templateForVisitType } from "@/server/domain/templates";
import type { ZoneNoteView } from "@/server/domain/zone-notes";

import { ManageZonesDialog } from "./manage-zones-dialog";
import { NoteConflictDialog } from "./note-conflict-dialog";
import { NoteContent } from "./note-content";
import { type EditorMode, ZoneEditor } from "./zone-editor";
import { ZoneNav } from "./zone-nav";

export interface NotesTabProps {
  visitId: string;
  visitType: VisitType;
  initialVersion: number;
  initialNotes: ZoneNoteView[];
  canEdit: boolean;
  userId: string;
}

const IDLE: NoteSaveStatus = { kind: "idle" };
const STRUCTURE_CONFLICT =
  "Cette visite a été modifiée entre-temps. Rechargez pour voir la dernière version.";

/**
 * « Notes » tab: zone selector (list from 1024 px, pills below), editor with per-zone
 * autosave and retries, zone management, per-zone conflict dialog and the read-only view.
 * The selected zone is reflected in the URL (`?onglet=notes&zone=docks`).
 */
export function NotesTab({
  visitId,
  visitType,
  initialVersion,
  initialNotes,
  canEdit,
  userId,
}: NotesTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [notes, setNotes] = useState(initialNotes);
  const [visitVersion, setVisitVersion] = useState(initialVersion);
  const [structureConflict, setStructureConflict] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, NoteSaveStatus>>({});
  const [mode, setMode] = useState<EditorMode>("edit");
  const [managing, setManaging] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState<{
    noteId: string;
    mine: string;
    theirs: NoteConflict;
  } | null>(null);

  const notesRef = useRef(notes);
  notesRef.current = notes;
  const saverRef = useRef<NoteSaver | null>(null);

  if (!saverRef.current) {
    saverRef.current = createNoteSaver({
      save: (noteId, version, content) => saveZoneNoteAction({ noteId, version, content }),
      getVersion: (noteId) => notesRef.current.find((n) => n.id === noteId)?.version ?? 1,
      onSaved: (noteId, version, savedAt, content) => {
        setNotes((list) =>
          list.map((n) =>
            n.id === noteId
              ? {
                  ...n,
                  version,
                  updatedAt: savedAt,
                  updatedBy: userId,
                  updatedByName: null,
                  content,
                }
              : n,
          ),
        );
      },
      onConflict: (noteId, mine, theirs) => setConflict({ noteId, mine, theirs }),
      onStatus: (noteId, status) => setStatuses((map) => ({ ...map, [noteId]: status })),
    });
    for (const note of initialNotes) saverRef.current.track(note.id, note.content);
  }
  const saver = saverRef.current;

  useEffect(() => () => saver.dispose(), [saver]);

  // Nothing is lost on a page unload or when the tab goes to the background.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!saver.hasPending()) return;
      saver.flushAll();
      event.preventDefault();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") saver.flushAll();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [saver]);

  const requestedZone = searchParams.get("zone");
  const selected = notes.find((n) => n.zoneKey === requestedZone) ?? notes[0] ?? null;
  const selectedIndex = selected ? notes.findIndex((n) => n.id === selected.id) : -1;

  const selectZone = useCallback(
    (id: string) => {
      const target = notesRef.current.find((n) => n.id === id);
      if (!target) return;
      if (selected && selected.id !== id) saver.flush(selected.id);
      const params = new URLSearchParams(searchParams.toString());
      params.set("onglet", "notes");
      params.set("zone", target.zoneKey);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, saver, searchParams, selected],
  );

  const valueOf = useCallback((note: ZoneNoteView) => drafts[note.id] ?? note.content, [drafts]);

  function change(noteId: string, value: string) {
    setDrafts((map) => ({ ...map, [noteId]: value }));
    saver.change(noteId, value);
  }

  function applyStructure(result: ZoneStructureActionResult): string | null {
    if (result.ok) {
      setVisitVersion(result.version);
      setNotes(result.notes);
      for (const note of result.notes) {
        if (!notesRef.current.some((n) => n.id === note.id)) saver.track(note.id, note.content);
      }
      return null;
    }
    if (result.conflict) {
      setStructureConflict(result.error || STRUCTURE_CONFLICT);
      setManaging(false);
    }
    return result.error;
  }

  async function structure(
    operation: () => Promise<ZoneStructureActionResult>,
  ): Promise<string | null> {
    setPending(true);
    try {
      return applyStructure(await operation());
    } finally {
      setPending(false);
    }
  }

  function keepMine() {
    if (!conflict) return;
    const { noteId, theirs } = conflict;
    setNotes((list) => list.map((n) => (n.id === noteId ? { ...n, version: theirs.version } : n)));
    setConflict(null);
    // The saver reads the version from the notes on its next run.
    requestAnimationFrame(() => saver.retry(noteId));
  }

  async function takeTheirs() {
    if (!conflict) return;
    const { noteId, mine, theirs } = conflict;
    setNotes((list) =>
      list.map((n) =>
        n.id === noteId
          ? {
              ...n,
              content: theirs.content,
              version: theirs.version,
              updatedAt: theirs.updatedAt,
              updatedByName: theirs.updatedByName,
              updatedBy: theirs.updatedByName ? "" : n.updatedBy,
            }
          : n,
      ),
    );
    setDrafts((map) => ({ ...map, [noteId]: theirs.content }));
    saver.track(noteId, theirs.content);
    setStatuses((map) => ({ ...map, [noteId]: IDLE }));
    setConflict(null);
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
    status: statuses[note.id],
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
                void structure(() =>
                  insertZoneTemplateAction({
                    visitId,
                    version: visitVersion,
                    templateKey: template.key,
                  }),
                ).then((message) => {
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
          canEdit ? (
            <ZoneEditor
              key={selected.id}
              note={selected}
              value={valueOf(selected)}
              status={statuses[selected.id] ?? IDLE}
              mode={mode}
              userId={userId}
              onModeChange={setMode}
              onChange={(value) => change(selected.id, value)}
              onBlur={() => saver.flush(selected.id)}
              onRetry={() => saver.retry(selected.id)}
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
          )
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
            return structure(() =>
              reorderZonesAction({ visitId, version: visitVersion, orderedIds: ordered }),
            );
          }}
          onRename={(noteId, label) =>
            structure(() => renameZoneAction({ visitId, version: visitVersion, noteId, label }))
          }
          onRemove={(noteId) =>
            structure(() => removeZoneAction({ visitId, version: visitVersion, noteId }))
          }
          onAdd={(label) =>
            structure(() => addZoneAction({ visitId, version: visitVersion, label }))
          }
          onAddTemplate={(zoneKey) =>
            structure(() => addTemplateZoneAction({ visitId, version: visitVersion, zoneKey }))
          }
        />
      ) : null}

      {conflict ? (
        <NoteConflictDialog
          zoneLabel={notes.find((n) => n.id === conflict.noteId)?.zoneLabel ?? ""}
          mine={conflict.mine}
          theirs={conflict.theirs}
          pending={statuses[conflict.noteId]?.kind === "saving"}
          onKeepMine={keepMine}
          onTakeTheirs={() => void takeTheirs()}
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
