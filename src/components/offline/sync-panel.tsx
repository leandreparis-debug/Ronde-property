"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Copy, RefreshCw, RotateCcw, Scale, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Galet } from "@/components/brand/Galet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import type { OutboxEntry } from "@/lib/offline/db";

import { useOptionalOffline } from "./offline-provider";
import { indicatorLabel, indicatorMood } from "./sync-indicator";

/** Text of a refused or waiting change that can be copied (« Copier le texte »). */
export function copyableText(entry: OutboxEntry): string | null {
  const payload = entry.payload as Record<string, unknown>;
  if (entry.kind === "note.update" && typeof payload.content === "string") return payload.content;
  if (entry.kind === "reserve.create" || entry.kind === "reserve.update") {
    const values = payload.values as { action?: string; description?: string } | undefined;
    return [values?.action, values?.description].filter(Boolean).join("\n\n") || null;
  }
  if (entry.kind === "visit.update") {
    const patch = payload.patch as { title?: string; subject?: string | null } | undefined;
    return [patch?.title, patch?.subject].filter(Boolean).join("\n\n") || null;
  }
  return null;
}

/** State of a waiting change, in plain words. */
function entryState(entry: OutboxEntry, online: boolean): string {
  if (entry.status === "rejected") return entry.rejection?.message ?? "Refusée par le serveur.";
  if (entry.status === "blocked")
    return "En attente d'une autre modification (refusée ou à arbitrer).";
  if (entry.photo) {
    if (entry.photo.stage === "put") return `Envoi ${entry.photo.progress} %`;
    if (entry.photo.stage === "confirm") return "Vérification";
  }
  if (entry.status === "sending") return "Envoi…";
  if (entry.lastError) return entry.lastError;
  return online ? "En attente d'envoi" : "Gardée sur la tablette";
}

/**
 * Synchronisation panel, opened from the header indicator: state, « Synchroniser maintenant »,
 * the session to renew, the conflicts to arbitrate, the refused changes (with « Copier le
 * texte », « Réessayer » and « Retirer ») and the list of the changes waiting, in plain words.
 */
export function SyncPanel() {
  const offline = useOptionalOffline();
  const db = offline?.db ?? null;
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const entries = useLiveQuery(
    async () => (db ? (await db.outbox.toArray()).sort((a, b) => a.seq - b.seq) : []),
    [db],
  );
  const conflicts = useLiveQuery(async () => (db ? db.conflicts.toArray() : []), [db]);
  const visits = useLiveQuery(
    async () => (db ? new Map((await db.visits.toArray()).map((v) => [v.id, v.title])) : new Map()),
    [db],
  );
  if (!offline) return null;
  const { status, online, engine, panelOpen, setPanelOpen, setArbitrating } = offline;
  const mood = indicatorMood(status, online);
  const rejected = (entries ?? []).filter((entry) => entry.status === "rejected");
  const waiting = (entries ?? []).filter((entry) => entry.status !== "rejected");

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ variant: "success", title: "Texte copié" });
    } catch {
      toast({ variant: "error", title: "Le texte n'a pas pu être copié" });
    }
  }

  async function syncNow() {
    if (!engine) return;
    setSyncing(true);
    try {
      await engine.flush();
    } finally {
      setSyncing(false);
    }
  }

  const visitTitle = (visitId: string) => visits?.get(visitId) ?? "Visite";

  return (
    <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
      <DialogContent
        hideCloseButton
        aria-describedby={undefined}
        className={cn(
          "top-0 left-0 h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none p-0",
          "sm:right-0 sm:left-auto sm:w-[30rem] sm:rounded-l-xl",
          "motion-safe:data-[state=open]:animate-sheet-in",
        )}
        data-testid="sync-panel"
      >
        <header className="flex items-center justify-between gap-2 border-b border-rule px-4 py-3">
          <DialogTitle className="font-display text-title-sm text-ink">Synchronisation</DialogTitle>
          <DialogClose asChild>
            <Button type="button" variant="ghost" aria-label="Fermer la synchronisation">
              <X className="size-5" aria-hidden="true" />
            </Button>
          </DialogClose>
        </header>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
          <section className="flex items-start gap-3" aria-live="polite">
            <Galet mood={mood} size={56} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-body font-semibold text-ink" data-testid="sync-panel-state">
                {indicatorLabel(status, online)}
              </p>
              <p className="text-ui text-ink-2">
                {status.lastSyncAt
                  ? `Dernière synchronisation : ${formatDateTime(status.lastSyncAt)}`
                  : "Aucune synchronisation sur cet appareil pour l'instant."}
              </p>
              {status.message && status.state !== "auth" ? (
                <p className="text-ui text-ink-2">{status.message}</p>
              ) : null}
              <Button
                type="button"
                className="mt-2 self-start"
                onClick={() => void syncNow()}
                loading={syncing}
                disabled={!online || !engine}
                data-testid="sync-now"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Synchroniser maintenant
              </Button>
              {!online ? (
                <p className="text-ui text-ink-2">
                  Hors réseau : l&apos;envoi part tout seul au retour du réseau.
                </p>
              ) : null}
            </div>
          </section>

          {status.state === "auth" ? (
            <section
              role="alert"
              className="flex flex-col gap-2 rounded-md border border-status-progress-dot bg-status-progress-bg p-3 text-ui text-ink"
            >
              <p className="font-semibold">{status.message}</p>
              <p>Vos modifications restent sur la tablette et partiront après la reconnexion.</p>
              <Button asChild variant="secondary" className="self-start">
                <a
                  href={`/connexion?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}
                >
                  Se reconnecter
                </a>
              </Button>
            </section>
          ) : null}

          {(conflicts ?? []).length > 0 ? (
            <section aria-labelledby="sync-conflicts" className="flex flex-col gap-2">
              <h3 id="sync-conflicts" className="label-caps text-ink-2">
                À arbitrer
              </h3>
              <ul className="flex flex-col gap-2" data-testid="sync-conflicts">
                {(conflicts ?? []).map((conflict) => (
                  <li
                    key={conflict.id}
                    className="flex flex-col gap-2 rounded-md border border-status-progress-dot bg-status-progress-bg p-3"
                  >
                    <p className="text-ui font-semibold text-ink">{conflict.label}</p>
                    <p className="text-ui text-ink-2">
                      {visitTitle(conflict.visitId)} · {conflict.message}
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      className="self-start"
                      onClick={() => {
                        setPanelOpen(false);
                        setArbitrating(conflict.id);
                      }}
                      data-testid="sync-arbitrate"
                    >
                      <Scale className="size-4" aria-hidden="true" />
                      Arbitrer
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {rejected.length > 0 ? (
            <section aria-labelledby="sync-rejected" className="flex flex-col gap-2">
              <h3 id="sync-rejected" className="label-caps text-ink-2">
                Refusées par le serveur
              </h3>
              <ul className="flex flex-col gap-2" data-testid="sync-rejected">
                {rejected.map((entry) => {
                  const text = copyableText(entry);
                  return (
                    <li
                      key={entry.opId}
                      className="flex flex-col gap-2 rounded-md border border-rule bg-paper p-3"
                      data-testid="sync-rejected-item"
                    >
                      <p className="text-ui font-semibold text-ink">{entry.label}</p>
                      <p className="text-ui text-ink-2">
                        {visitTitle(entry.visitId)} · {entryState(entry, online)}
                      </p>
                      {text ? (
                        <pre className="max-h-32 overflow-y-auto rounded-md bg-craie px-3 py-2 font-sans text-ui whitespace-pre-wrap text-ink">
                          {text}
                        </pre>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {text ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void copy(text)}
                            data-testid="sync-copy-text"
                          >
                            <Copy className="size-4" aria-hidden="true" />
                            Copier le texte
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={!online}
                          onClick={() => void engine?.retry(entry.opId)}
                        >
                          <RotateCcw className="size-4" aria-hidden="true" />
                          Réessayer
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => void engine?.remove(entry.opId)}
                          data-testid="sync-remove"
                        >
                          <X className="size-4" aria-hidden="true" />
                          Retirer
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="sync-waiting" className="flex flex-col gap-2">
            <h3 id="sync-waiting" className="label-caps text-ink-2">
              En attente ({waiting.length})
            </h3>
            {waiting.length === 0 ? (
              <p className="text-ui text-ink-2" data-testid="sync-empty">
                Rien n&apos;attend : tout est sur le serveur.
              </p>
            ) : (
              <ul className="flex flex-col gap-1" data-testid="sync-waiting">
                {waiting.map((entry) => (
                  <li
                    key={entry.opId}
                    className="flex items-start gap-2 rounded-md bg-craie px-3 py-2"
                    data-testid="sync-waiting-item"
                  >
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-pill bg-brand"
                      aria-hidden="true"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-ui font-semibold text-ink">{entry.label}</span>
                      <span className="truncate text-label text-ink-2">
                        <Link href={`/visites/${entry.visitId}`} className="underline">
                          {visitTitle(entry.visitId)}
                        </Link>{" "}
                        · {entryState(entry, online)}
                      </span>
                    </span>
                    {entry.photo && entry.lastError ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void engine?.retry(entry.opId)}
                        disabled={!online}
                      >
                        Réessayer
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
