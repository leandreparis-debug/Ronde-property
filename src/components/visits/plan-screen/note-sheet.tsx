"use client";

import { Move, Trash2 } from "lucide-react";
import { useState } from "react";

import { ErrorNotice } from "@/components/auth/error-notice";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_LABEL_MAX_LENGTH } from "@/server/domain/plans";

import { SheetPanel } from "./sheet-panel";

/**
 * « Note » of the quick menu (step 12 b): a text of 500 characters at most, kept as a marker of
 * kind « note » (yellow « ✎ » pin). Editing an existing note offers « Déplacer » and
 * « Supprimer » as well. Read-only: the text alone.
 */
export function NoteSheet({
  initial,
  where,
  canEdit,
  moving = false,
  onSave,
  onClose,
  onStartMove,
  onDelete,
}: {
  /** Text of the note being edited, `null` for a new one. */
  initial: string | null;
  where: string;
  canEdit: boolean;
  moving?: boolean;
  onSave: (text: string) => Promise<string | null>;
  onClose: () => void;
  onStartMove?: () => void;
  onDelete?: () => Promise<string | null>;
}) {
  const [text, setText] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = initial === null;

  async function save() {
    if (text.trim() === "") {
      setError("Écrivez la note avant de l'enregistrer.");
      return;
    }
    setBusy(true);
    const problem = await onSave(text.trim());
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <SheetPanel
      title={isNew ? "Nouvelle note" : "Note sur le plan"}
      subtitle={where}
      onClose={onClose}
      closeLabel="Fermer la note"
      testId="note-sheet"
      className="bg-note-soft"
    >
      {canEdit ? (
        <label className="flex flex-col gap-1 text-ui font-semibold">
          Note
          <Textarea
            value={text}
            rows={4}
            maxLength={NOTE_LABEL_MAX_LENGTH}
            autoFocus={isNew}
            onChange={(event) => setText(event.target.value)}
            data-testid="note-text"
          />
          <span className="text-label font-normal text-ink-2">
            {text.length} / {NOTE_LABEL_MAX_LENGTH} caractères
          </span>
        </label>
      ) : (
        <p className="text-body whitespace-pre-wrap text-ink" data-testid="note-text-readonly">
          {initial}
        </p>
      )}
      {error ? <ErrorNotice message={error} /> : null}
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="lg"
            loading={busy}
            onClick={() => void save()}
            data-testid="note-save"
          >
            Enregistrer
          </Button>
          {!isNew && onStartMove ? (
            <Button
              type="button"
              variant={moving ? "primary" : "secondary"}
              aria-pressed={moving}
              onClick={onStartMove}
              data-testid="note-move"
            >
              <Move className="size-5" aria-hidden="true" />
              {moving ? "Touchez le plan" : "Déplacer"}
            </Button>
          ) : null}
          {!isNew && onDelete ? (
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                const problem = await onDelete();
                if (problem) setError(problem);
              }}
              data-testid="note-delete"
            >
              <Trash2 className="size-5" aria-hidden="true" />
              Supprimer
            </Button>
          ) : null}
        </div>
      ) : null}
    </SheetPanel>
  );
}
