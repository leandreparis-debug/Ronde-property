"use client";

import { ChevronLeft, ChevronRight, Eye, List, Pencil, RotateCcw } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  insertBullets,
  NOTE_COUNTER_THRESHOLD,
  NOTE_MAX_LENGTH,
  parseNoteContent,
} from "@/lib/notes/format";
import type { NoteSaveStatus } from "@/lib/notes/saver";
import type { ZoneNoteView } from "@/server/domain/zone-notes";

import { NoteContent } from "./note-content";

export type EditorMode = "edit" | "preview";

export interface ZoneEditorProps {
  note: ZoneNoteView;
  value: string;
  status: NoteSaveStatus;
  mode: EditorMode;
  userId: string;
  onModeChange: (mode: EditorMode) => void;
  onChange: (value: string) => void;
  onBlur: () => void;
  onRetry: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

/** Text of the status line of the editor. */
export function statusLabel(status: NoteSaveStatus): string {
  switch (status.kind) {
    case "saving":
      return "Enregistrement…";
    case "saved":
      return `Enregistré à ${formatDateTime(status.at).slice(-5)}`;
    case "offline":
      return "Hors connexion : nouvelle tentative…";
    case "error":
      return `Erreur, réessayer : ${status.message}`;
    default:
      return "Enregistrement automatique.";
  }
}

/**
 * Editor of one zone: title, toolbar (« Puce », « Saisie / Aperçu du rapport »), 16 px
 * auto-growing textarea, status line, character counter from 18 000 and the author of the
 * last change when it is someone else.
 */
export function ZoneEditor({
  note,
  value,
  status,
  mode,
  userId,
  onModeChange,
  onChange,
  onBlur,
  onRetry,
  onPrevious,
  onNext,
}: ZoneEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function bullet() {
    const element = textareaRef.current;
    if (!element) return;
    const next = insertBullets({
      text: value,
      selectionStart: element.selectionStart,
      selectionEnd: element.selectionEnd,
    });
    onChange(next.text);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  }

  const someoneElse = note.updatedBy && note.updatedBy !== userId ? note.updatedByName : null;
  const blocks = parseNoteContent(value);

  return (
    <section
      aria-labelledby={`zone-title-${note.id}`}
      className="flex min-w-0 flex-1 flex-col gap-4"
      data-testid="zone-editor"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={`zone-title-${note.id}`} className="font-display text-title-sm text-ink">
          {note.zoneLabel}
        </h3>
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Outils">
          <Button
            type="button"
            variant="secondary"
            onClick={bullet}
            disabled={mode === "preview"}
            aria-label="Puce : insérer « - » au début de la ligne"
          >
            <List className="size-5" aria-hidden="true" />
            Puce
          </Button>
          <div className="inline-flex rounded-md border border-rule bg-paper p-0.5" role="group">
            <button
              type="button"
              aria-pressed={mode === "edit"}
              onClick={() => onModeChange("edit")}
              className={cn(
                "rounded inline-flex h-11 items-center gap-1.5 px-3 text-ui font-semibold",
                mode === "edit" ? "bg-brand-soft text-brand-deep" : "text-ink-2 hover:text-ink",
              )}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Saisie
            </button>
            <button
              type="button"
              aria-pressed={mode === "preview"}
              onClick={() => onModeChange("preview")}
              className={cn(
                "rounded inline-flex h-11 items-center gap-1.5 px-3 text-ui font-semibold",
                mode === "preview" ? "bg-brand-soft text-brand-deep" : "text-ink-2 hover:text-ink",
              )}
            >
              <Eye className="size-4" aria-hidden="true" />
              Aperçu du rapport
            </button>
          </div>
        </div>
      </div>

      {mode === "edit" ? (
        <Textarea
          ref={textareaRef}
          id={`zone-note-${note.zoneKey}`}
          aria-label={`Observations sur la zone ${note.zoneLabel}`}
          value={value}
          rows={8}
          maxLength={NOTE_MAX_LENGTH}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          placeholder={`Vos observations sur la zone ${note.zoneLabel}. Commencez une ligne par « - » pour créer une puce.`}
          className="min-h-[13rem] text-body"
          data-testid="zone-textarea"
        />
      ) : (
        <div
          className="min-h-[13rem] rounded-md border border-rule bg-paper px-4 py-3"
          data-testid="zone-preview"
        >
          {blocks.length > 0 ? (
            <NoteContent blocks={blocks} />
          ) : (
            <p className="text-body text-ink-2 italic">Aucune observation</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-ui text-ink-2">
        <p
          role="status"
          aria-live="polite"
          data-testid="note-save-status"
          className="flex items-center gap-2"
        >
          <span>{statusLabel(status)}</span>
          {status.kind === "error" ? (
            <Button type="button" variant="ghost" onClick={onRetry} className="px-2">
              <RotateCcw className="size-4" aria-hidden="true" />
              Réessayer
            </Button>
          ) : null}
        </p>
        <p className="flex flex-wrap items-center gap-3">
          {someoneElse ? (
            <span data-testid="note-last-author">
              Modifié par {someoneElse} à {formatDateTime(note.updatedAt).slice(-5)}
            </span>
          ) : null}
          {value.length >= NOTE_COUNTER_THRESHOLD ? (
            <span
              data-testid="note-counter"
              className={cn(value.length >= NOTE_MAX_LENGTH && "text-status-open")}
            >
              {formatNumber(value.length)} / {formatNumber(NOTE_MAX_LENGTH)} caractères
            </span>
          ) : null}
        </p>
      </div>

      {onPrevious || onNext ? (
        <div className="flex items-center justify-between gap-2 lg:hidden">
          <Button type="button" variant="secondary" onClick={onPrevious} disabled={!onPrevious}>
            <ChevronLeft className="size-5" aria-hidden="true" />
            Zone précédente
          </Button>
          <Button type="button" variant="secondary" onClick={onNext} disabled={!onNext}>
            Zone suivante
            <ChevronRight className="size-5" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </section>
  );
}
