"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { parseNoteContent } from "@/lib/notes/format";
import type { NoteConflict } from "@/lib/notes/saver";

import { NoteContent } from "./note-content";

export interface NoteConflictDialogProps {
  zoneLabel: string;
  mine: string;
  theirs: NoteConflict;
  pending: boolean;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
}

/**
 * Someone else saved this zone first. Shows both texts; nothing happens until the user
 * chooses « Garder ma version » or « Prendre la sienne ».
 */
export function NoteConflictDialog({
  zoneLabel,
  mine,
  theirs,
  pending,
  onKeepMine,
  onTakeTheirs,
}: NoteConflictDialogProps) {
  const who = theirs.updatedByName ?? "Un autre utilisateur";
  const theirBlocks = parseNoteContent(theirs.content);
  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        hideCloseButton
        className="max-w-3xl"
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
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onTakeTheirs} disabled={pending}>
            Prendre la sienne
          </Button>
          <Button type="button" onClick={onKeepMine} loading={pending}>
            Garder ma version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
