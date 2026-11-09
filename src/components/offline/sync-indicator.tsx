"use client";

import { Galet, type GaletMood } from "@/components/brand/Galet";
import { cn } from "@/lib/cn";
import type { SyncStatus } from "@/lib/offline/engine";
import { formatDateTime } from "@/lib/format";

import { useOptionalOffline } from "./offline-provider";

/** The four moods of the indicator. */
export type IndicatorMood = "asleep" | "attentive" | "happy" | "worried";

/**
 * Mood of the mascot for a synchronisation status: asleep offline (changes waiting),
 * attentive while sending, happy when everything is up to date, worried on a conflict, a
 * refused change, an error or an expired session.
 */
export function indicatorMood(status: SyncStatus, online: boolean): IndicatorMood {
  if (
    status.state === "auth" ||
    status.state === "conflict" ||
    status.state === "error" ||
    status.conflicts > 0 ||
    status.rejected > 0
  ) {
    return "worried";
  }
  if (!online || status.state === "offline") return "asleep";
  if (status.state === "syncing" || status.pending > 0) return "attentive";
  return "happy";
}

/** One-line description of the status, for the button and screen readers. */
export function indicatorLabel(status: SyncStatus, online: boolean): string {
  const pending = status.pending;
  const waiting =
    pending === 0
      ? "aucune modification en attente"
      : `${pending} modification${pending > 1 ? "s" : ""} en attente`;
  switch (indicatorMood(status, online)) {
    case "asleep":
      return `Hors réseau, ${waiting}`;
    case "attentive":
      return `Synchronisation en cours, ${waiting}`;
    case "worried":
      if (status.state === "auth") return "Session expirée, reconnexion nécessaire";
      if (status.conflicts > 0) {
        return `${status.conflicts} conflit${status.conflicts > 1 ? "s" : ""} à arbitrer`;
      }
      if (status.rejected > 0) {
        return `${status.rejected} modification${status.rejected > 1 ? "s" : ""} refusée${status.rejected > 1 ? "s" : ""}`;
      }
      return `Erreur de synchronisation, ${waiting}`;
    default:
      return "Tout est à jour";
  }
}

const MOOD: Record<IndicatorMood, GaletMood> = {
  asleep: "asleep",
  attentive: "attentive",
  happy: "happy",
  worried: "worried",
};

/**
 * Synchronisation indicator of the header, always visible: the « Galet » in one of four moods,
 * the number of changes waiting and the time of the last synchronisation. A touch opens the
 * synchronisation panel.
 */
export function SyncIndicator({ compact = false }: { compact?: boolean }) {
  const offline = useOptionalOffline();
  if (!offline) return null;
  const { status, online, setPanelOpen } = offline;
  const mood = indicatorMood(status, online);
  const label = indicatorLabel(status, online);
  const count = status.pending + status.rejected + status.conflicts;
  return (
    <button
      type="button"
      onClick={() => setPanelOpen(true)}
      className={cn(
        "relative flex min-h-11 min-w-11 items-center gap-2 rounded-md px-1.5 text-left text-ink hover:bg-craie",
        "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
        !compact && "w-full px-2 py-1",
      )}
      // Compact: no visible text, the name says it all. Otherwise the visible text is the name
      // (WCAG 2.5.3, « label in name »), completed by a hidden hint.
      aria-label={compact ? `${label}. Ouvrir la synchronisation` : undefined}
      data-testid="sync-indicator"
      data-mood={mood}
      data-pending={status.pending}
    >
      <span className="relative shrink-0">
        <Galet mood={MOOD[mood]} size={compact ? 32 : 36} />
        {count > 0 ? (
          <span
            className="absolute -top-1.5 -right-2 inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-ink px-1 text-label font-bold text-paper tabular-nums"
            data-testid="sync-count"
            aria-hidden="true"
          >
            {count}
          </span>
        ) : null}
      </span>
      {compact ? null : (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-ui font-semibold">{label}</span>
          <span className="truncate text-label text-ink-2">
            {status.lastSyncAt
              ? `Synchronisé à ${formatDateTime(status.lastSyncAt).slice(-5)}`
              : "Pas encore synchronisé"}
          </span>
          <span className="sr-only">Ouvrir la synchronisation</span>
        </span>
      )}
    </button>
  );
}
