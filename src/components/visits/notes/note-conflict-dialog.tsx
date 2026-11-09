"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { NOTE_MAX_LENGTH, parseNoteContent } from "@/lib/notes/format";
import type { NoteConflict } from "@/lib/notes/status";

import { NoteContent } from "./note-content";

export interface NoteConflictDialogProps {
  zoneLabel: string;
  mine: string;
  theirs: NoteConflict;
  pending: boolean;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
  /** « Fusionner »: saves the edited text built from both versions. */
  onMerge?: (merged: string) => void;
}

/** Text proposed by « Fusionner »: the server version, then mine, separated by a blank line. */
export function mergedDraft(theirs: string, mine: string): string {
  if (theirs.trim() === "") return mine;
  if (mine.trim() === "" || theirs.trim() === mine.trim()) return theirs;
  return `${theirs.trimEnd()}\n\n${mine.trim()}`;
}

/**
 * Someone else saved this zone first. Shows both texts side by side; nothing happens until the
 * user chooses « Garder ma version », « Prendre la sienne » or « Fusionner » (a field prefilled
 * with both texts, saved on the server version).
 */
export function NoteConflictDialog({
  zoneLabel,
  mine,
  theirs,
  pending,
  onKeepMine,
  onTakeTheirs,
  onMerge,
}: NoteConflictDialogProps) {
  const who = theirs.updatedByName ?? "Un autre utilisateur";
  const theirBlocks = parseNoteContent(theirs.content);
  const [merging, setMerging] = useState(false);
  const [merged, setMerged] = useState(() => mergedDraft(theirs.content, mine));
  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        hideCloseButton
        className="max-h-[90dvh] max-w-3xl overflow-y-auto"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        data-testid="note-conflict"
      >
        <DialogHeader>
          <DialogTitle>Conflit sur la zone {zoneLabel}</DialogTitle>
          <DialogDescription>
            {who} a modifié cette zone à {formatDateTime(theirs.updatedAt).slice(-5)}. Choisissez la
            version à conserver ; rien n&apos;est enregistré sans votre choix.
          </DialogDescription>
        </DialogHeader>
        {merging ? (
          <label className="flex flex-col gap-2">
            <span className="label-caps text-ink-2">Texte fusionné</span>
            <Textarea
              value={merged}
              rows={10}
              maxLength={NOTE_MAX_LENGTH}
              onChange={(event) => setMerged(event.target.value)}
              data-testid="note-merge-text"
            />
          </label>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="label-caps text-ink-2">Sa version</p>
              <div className="max-h-72 overflow-y-auto rounded-md border border-rule bg-craie px-3.5 py-3">
                {theirBlocks.length > 0 ? (
                  <NoteContent blocks={theirBlocks} />
                ) : (
                  <p className="text-body text-ink-2 italic">Aucune observation</p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="label-caps text-ink-2">Votre texte</p>
              <pre className="max-h-72 overflow-y-auto rounded-md border border-brand bg-brand-tint px-3.5 py-3 font-sans text-body whitespace-pre-wrap text-ink">
                {mine || "Aucune observation"}
              </pre>
            </div>
          </div>
        )}
        <DialogFooter>
          {merging ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setMerging(false)}>
                Retour
              </Button>
              <Button
                type="button"
                loading={pending}
                onClick={() => onMerge?.(merged)}
                data-testid="note-merge-save"
              >
                Enregistrer la fusion
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={onTakeTheirs} disabled={pending}>
                Prendre la sienne
              </Button>
              {onMerge ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setMerging(true)}
                  disabled={pending}
                  data-testid="note-merge"
                >
                  Fusionner
                </Button>
              ) : null}
              <Button type="button" onClick={onKeepMine} loading={pending}>
                Garder ma version
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
