"use client";

import { useEffect, useRef, useState } from "react";

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
import { useToast } from "@/components/ui/toast";
import { estimateKeepSize, fetchBlob, keepVisitOffline, unkeepVisit } from "@/lib/offline/keep";
import type { VisitSnapshot } from "@/lib/offline/snapshot";
import { formatBytes } from "@/lib/offline/storage";

import { fetchVisitSnapshot, useOffline } from "./offline-provider";

/**
 * « Garder hors réseau »: reads the visit from the server, shows the estimated size, then
 * downloads its photos and the useful plan pages into the tablet with a progress bar.
 * « Ne plus garder hors réseau » removes the local copy (refused while changes wait).
 */
export function KeepOfflineDialog({
  open,
  onOpenChange,
  visitId,
  kept,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitId: string;
  kept: boolean;
}) {
  const { db, online, refreshUsage, usage } = useOffline();
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<VisitSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; bytes: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || kept) return;
    setSnapshot(null);
    setError(null);
    setProgress(null);
    if (!online) {
      setError("Garder une visite hors réseau demande le réseau, le temps du téléchargement.");
      return;
    }
    let cancelled = false;
    void fetchVisitSnapshot(visitId)
      .then((result) => {
        if (cancelled) return;
        if ("snapshot" in result) setSnapshot(result.snapshot);
        else setError("La visite n'a pas pu être lue. Réessayez dans un instant.");
      })
      .catch(() => !cancelled && setError("Le serveur est injoignable."));
    return () => {
      cancelled = true;
    };
  }, [open, kept, online, visitId]);

  async function keep() {
    if (!db || !snapshot) return;
    setBusy(true);
    setError(null);
    const abort = new AbortController();
    controller.current = abort;
    const started = performance.now();
    try {
      const result = await keepVisitOffline(db, snapshot, {
        fetchBlob,
        signal: abort.signal,
        onProgress: setProgress,
      });
      await refreshUsage();
      const seconds = Math.max(1, Math.round((performance.now() - started) / 1000));
      if (result.failed > 0) {
        setError(
          `${result.failed} fichier${result.failed > 1 ? "s n'ont" : " n'a"} pas pu être téléchargé${result.failed > 1 ? "s" : ""} : relancez « Garder hors réseau » pour les reprendre.`,
        );
      } else {
        toast({
          variant: "success",
          title: "Visite disponible hors réseau",
          description: `${formatBytes(result.bytes)} téléchargés en ${seconds} s.`,
        });
        onOpenChange(false);
      }
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }

  async function unkeep() {
    if (!db) return;
    setBusy(true);
    const result = await unkeepVisit(db, visitId);
    setBusy(false);
    if (!result.ok) {
      setError(
        "Des modifications de cette visite attendent encore d'être envoyées : elle reste sur la tablette jusqu'à leur synchronisation.",
      );
      return;
    }
    await refreshUsage();
    toast({ variant: "info", title: "La visite n'est plus gardée hors réseau" });
    onOpenChange(false);
    // The copy is gone: the page reads the server again.
    window.location.reload();
  }

  const estimate = snapshot ? estimateKeepSize(snapshot) : null;
  const pageCount = snapshot
    ? Object.values(snapshot.planPages).reduce((sum, pages) => sum + pages.length, 0)
    : 0;
  const ratio = progress && progress.total > 0 ? progress.done / progress.total : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) controller.current?.abort();
        onOpenChange(value);
      }}
    >
      <DialogContent data-testid="keep-offline-dialog">
        <DialogHeader>
          <DialogTitle>
            {kept ? "Ne plus garder cette visite hors réseau ?" : "Garder cette visite hors réseau"}
          </DialogTitle>
          <DialogDescription>
            {kept
              ? "Ses photos et ses pages de plan seront retirées de la tablette. Elle restera consultable avec le réseau."
              : "La visite, ses photos et les pages de plan utiles sont copiées sur la tablette : vous pourrez la poursuivre sans réseau, même après avoir fermé l'application."}
          </DialogDescription>
        </DialogHeader>
        {!kept ? (
          <div className="flex flex-col gap-2 text-ui text-ink" data-testid="keep-offline-size">
            {snapshot && estimate !== null ? (
              <p>
                Taille estimée : <strong>{formatBytes(estimate)}</strong> ({snapshot.photos.length}{" "}
                photo{snapshot.photos.length > 1 ? "s" : ""}, {pageCount} page
                {pageCount > 1 ? "s" : ""} de plan au plus).
                {usage ? ` Espace utilisé sur la tablette : ${formatBytes(usage.usageBytes)}.` : ""}
              </p>
            ) : !error ? (
              <p className="text-ink-2">Calcul de la taille…</p>
            ) : null}
            {progress ? (
              <div className="flex flex-col gap-1" role="status" aria-live="polite">
                <p data-testid="keep-offline-progress">
                  Téléchargement {progress.done} sur {progress.total} ·{" "}
                  {formatBytes(progress.bytes)}
                </p>
                <div
                  className="h-2 w-full overflow-hidden rounded-pill bg-galet"
                  role="progressbar"
                  aria-label="Téléchargement de la visite"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(ratio * 100)}
                >
                  <div
                    className="h-full rounded-pill bg-brand"
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-ui font-medium text-status-open">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {busy && !kept ? "Arrêter" : "Annuler"}
            </Button>
          </DialogClose>
          {kept ? (
            <Button
              type="button"
              loading={busy}
              onClick={() => void unkeep()}
              data-testid="unkeep-offline"
            >
              Ne plus garder
            </Button>
          ) : (
            <Button
              type="button"
              loading={busy}
              disabled={!snapshot || !db}
              onClick={() => void keep()}
              data-testid="keep-offline-start"
            >
              Garder hors réseau
              {estimate !== null ? ` (${formatBytes(estimate)})` : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
