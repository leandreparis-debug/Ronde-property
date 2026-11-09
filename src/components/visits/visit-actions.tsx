"use client";

import {
  CloudDownload,
  CloudOff,
  Copy,
  Flag,
  MoreHorizontal,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { ErrorNotice } from "@/components/auth/error-notice";
import { SubmitButton } from "@/components/auth/submit-button";
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
import { initialActionState } from "@/server/actions/state";
import {
  completeVisitAction,
  deleteVisitAction,
  duplicateVisitAction,
  reopenVisitAction,
} from "@/server/actions/visit-actions";
import { useOffline } from "@/components/offline/offline-provider";
import { KeepOfflineDialog } from "@/components/offline/keep-offline-dialog";
import type { VisitView } from "@/lib/offline/snapshot";
import type { IncompletePoint } from "@/server/domain/visits";

export interface VisitActionsProps {
  visit: VisitView;
  canCreate: boolean;
  incomplete: IncompletePoint[];
  /** Operations of this visit waiting in the outbox, and conflicts to arbitrate. */
  pendingCount?: number;
  conflictsCount?: number;
  /** The visit is kept offline on this device. */
  kept?: boolean;
}

type Pending = "duplicate" | "complete" | "reopen" | "delete" | "keep" | null;

/** Reason shown under the actions that need the server while offline. */
export const OFFLINE_ACTIONS_REASON =
  "Hors réseau : terminer, rouvrir, dupliquer et supprimer la visite demandent le réseau.";

/** Duplicate, complete, reopen and delete, inline from 1024 px and in an « Actions » dialog below. */
export function VisitActions({
  visit,
  canCreate,
  incomplete,
  pendingCount = 0,
  conflictsCount = 0,
  kept = false,
}: VisitActionsProps) {
  const { online, setPanelOpen } = useOffline();
  const [pending, setPending] = useState<Pending>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { toast } = useToast();
  const [completeState, complete] = useActionState(completeVisitAction, initialActionState);
  const [reopenState, reopen] = useActionState(reopenVisitAction, initialActionState);
  const [duplicateState, duplicate] = useActionState(duplicateVisitAction, initialActionState);
  const [deleteState, remove] = useActionState(deleteVisitAction, initialActionState);

  useEffect(() => {
    if (completeState.ok) {
      setPending(null);
      toast({ variant: "success", title: "Visite terminée" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to each result only
  }, [completeState.tick]);
  useEffect(() => {
    if (reopenState.ok) {
      setPending(null);
      toast({ variant: "success", title: "Visite rouverte" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to each result only
  }, [reopenState.tick]);

  const items: Array<{
    key: Exclude<Pending, null>;
    label: string;
    icon: typeof Copy;
    variant?: "danger";
    /** Needs the server: disabled offline. */
    server: boolean;
  }> = [];
  const editable = visit.permissions.canEdit && visit.status === "in_progress";
  if (editable)
    items.push({
      key: "keep",
      label: kept ? "Ne plus garder hors réseau" : "Garder hors réseau",
      icon: kept ? CloudOff : CloudDownload,
      server: !kept,
    });
  if (canCreate && !visit.deletedAt)
    items.push({ key: "duplicate", label: "Dupliquer", icon: Copy, server: true });
  if (editable)
    items.push({ key: "complete", label: "Terminer la visite", icon: Flag, server: true });
  if (visit.permissions.canManage && visit.status === "completed")
    items.push({ key: "reopen", label: "Rouvrir", icon: RotateCcw, server: true });
  if (visit.permissions.canManage && !visit.deletedAt)
    items.push({
      key: "delete",
      label: "Supprimer",
      icon: Trash2,
      variant: "danger",
      server: true,
    });
  if (items.length === 0) return null;
  const waiting = pendingCount + conflictsCount;

  function open(key: Exclude<Pending, null>) {
    setMenuOpen(false);
    setPending(key);
  }

  const buttons = items.map((item) => (
    <Button
      key={item.key}
      type="button"
      variant={item.variant ?? "secondary"}
      onClick={() => open(item.key)}
      disabled={item.server && !online}
      className="justify-start lg:justify-center"
      data-testid={`visit-action-${item.key}`}
    >
      <item.icon className="size-5" aria-hidden="true" />
      {item.label}
    </Button>
  ));

  return (
    <>
      <div className="hidden flex-col items-end gap-1 lg:flex">
        <div className="flex flex-wrap justify-end gap-2" data-testid="visit-actions">
          {buttons}
        </div>
        {!online ? (
          <p
            className="max-w-md text-right text-ui text-ink-2"
            data-testid="offline-reason-actions"
          >
            {OFFLINE_ACTIONS_REASON}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="secondary"
        className="lg:hidden"
        onClick={() => setMenuOpen(true)}
        aria-haspopup="dialog"
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
        Actions
      </Button>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Actions</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">{buttons}</div>
          {!online ? <p className="text-ui text-ink-2">{OFFLINE_ACTIONS_REASON}</p> : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={pending === "duplicate"}
        onOpenChange={(o) => (o ? undefined : setPending(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dupliquer cette visite ?</DialogTitle>
            <DialogDescription>
              Une nouvelle visite en cours sera créée sur le même site, datée
              d&apos;aujourd&apos;hui, avec le type, le motif, l&apos;objet, le rédacteur et les
              participants (tous présents) et la liste des zones de notes, sans leur contenu. Les
              photos, repères, réserves et rapports ne sont pas repris.
            </DialogDescription>
          </DialogHeader>
          <form action={duplicate} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={visit.id} />
            {duplicateState.error ? <ErrorNotice message={duplicateState.error} /> : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Annuler
                </Button>
              </DialogClose>
              <SubmitButton>Dupliquer</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pending === "complete"}
        onOpenChange={(o) => (o ? undefined : setPending(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terminer la visite ?</DialogTitle>
            <DialogDescription>
              Les champs seront verrouillés. Vous pourrez la rouvrir si besoin.
            </DialogDescription>
          </DialogHeader>
          {incomplete.length > 0 ? (
            <div className="rounded-md bg-status-progress-bg p-3 text-ui text-status-progress">
              <p className="font-semibold">Points à compléter</p>
              <ul className="mt-1 list-disc pl-5">
                {incomplete.map((point) => (
                  <li key={point.key}>{point.label}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {waiting > 0 ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-md border border-rule bg-brand-tint p-3 text-ui text-ink"
              data-testid="complete-blocked"
            >
              <p>
                {conflictsCount > 0
                  ? `${conflictsCount} conflit${conflictsCount > 1 ? "s" : ""} à arbitrer et ${pendingCount} modification${pendingCount > 1 ? "s" : ""} en attente : `
                  : `${pendingCount} modification${pendingCount > 1 ? "s" : ""} de cette visite ${pendingCount > 1 ? "attendent" : "attend"} d'être synchronisée${pendingCount > 1 ? "s" : ""} : `}
                la visite ne peut être terminée qu&apos;une fois tout envoyé au serveur.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="self-start"
                onClick={() => {
                  setPending(null);
                  setPanelOpen(true);
                }}
              >
                Voir la synchronisation
              </Button>
            </div>
          ) : null}
          <form action={complete} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={visit.id} />
            {completeState.error ? <ErrorNotice message={completeState.error} /> : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Annuler
                </Button>
              </DialogClose>
              <SubmitButton disabled={waiting > 0 || !online}>Terminer la visite</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <KeepOfflineDialog
        open={pending === "keep"}
        onOpenChange={(o) => (o ? undefined : setPending(null))}
        visitId={visit.id}
        kept={kept}
      />

      <Dialog open={pending === "reopen"} onOpenChange={(o) => (o ? undefined : setPending(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rouvrir la visite ?</DialogTitle>
            <DialogDescription>
              Elle repassera « En cours » et redeviendra modifiable. L&apos;opération est tracée.
            </DialogDescription>
          </DialogHeader>
          <form action={reopen} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={visit.id} />
            {reopenState.error ? <ErrorNotice message={reopenState.error} /> : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Annuler
                </Button>
              </DialogClose>
              <SubmitButton>Rouvrir</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={pending === "delete"} onOpenChange={(o) => (o ? undefined : setPending(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer la visite « {visit.title} » ?</DialogTitle>
            <DialogDescription>
              Elle disparaîtra de la liste. L&apos;opération est tracée.
            </DialogDescription>
          </DialogHeader>
          <form action={remove} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={visit.id} />
            {deleteState.error ? <ErrorNotice message={deleteState.error} /> : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Annuler
                </Button>
              </DialogClose>
              <SubmitButton variant="danger">Supprimer</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
