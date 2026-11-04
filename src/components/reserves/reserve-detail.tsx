"use client";

import { CheckCircle2, MapPinned, Pencil, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorNotice } from "@/components/auth/error-notice";
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
import { formatDate, formatDateTime } from "@/lib/format";
import { overdueLabel } from "@/lib/reserves/dates";
import {
  deleteReserveAction,
  removeReserveFromPlanAction,
  setReserveStatusAction,
} from "@/server/actions/reserve-actions";
import type { ReserveStatus, VisitStatus } from "@/server/domain/enums";
import type { PhotoView } from "@/server/photos/types";
import type { ReserveDetail, ReserveHistoryEntry } from "@/server/reserves/types";

import { PriorityBadge, ReserveStatusPill, ResponsibleText } from "./reserve-card";
import { ReserveSheet } from "./reserve-sheet";

/** Link placing (or moving) a reserve on a plan of the visit. */
export function placeOnPlanHref(visitId: string, reserveId: string): string {
  return `/visites/${visitId}?onglet=plans&placer=${reserveId}`;
}

const STATUS_VERBS: Record<ReserveStatus, string> = {
  open: "Rouverte",
  in_progress: "Passée en cours",
  done: "Levée",
};

/** One readable sentence per history entry. */
export function historyLines(entry: ReserveHistoryEntry): string[] {
  const by = entry.actorName ? ` par ${entry.actorName}` : "";
  const when = ` le ${formatDateTime(entry.createdAt)}`;
  switch (entry.type) {
    case "created":
      return [`Créée${by}${when}`];
    case "status_changed":
      return [`${entry.toStatus ? STATUS_VERBS[entry.toStatus] : "Statut modifié"}${by}${when}`];
    case "deleted":
      return [`Supprimée${by}${when}`];
    case "updated":
      if (entry.changes.length === 0) return [`Modifiée${by}${when}`];
      return entry.changes.map((change) =>
        change.from === ""
          ? `${change.label} ${change.to}${by}${when}`
          : `${change.label} : ${change.from} → ${change.to}${by}${when}`,
      );
  }
}

export interface ReserveDetailViewProps {
  reserve: ReserveDetail;
  history: ReserveHistoryEntry[];
  visit: { id: string; title: string; siteId: string; status: VisitStatus };
  canEdit: boolean;
  zones: Array<{ key: string; label: string }>;
  photos: PhotoView[];
}

/**
 * Detail of a reserve: code, status, priority, action, description, zone, responsible (the
 * e-mail of an external responsible appears here only), due date and delay, defect photos,
 * plan link, history (`reserve_events`), and for an editor: « Modifier », « Lever » /
 * « Rouvrir », « Placer sur le plan », « Retirer du plan », « Supprimer » (confirmation naming
 * the reserve).
 */
export function ReserveDetailView({
  reserve,
  history,
  visit,
  canEdit,
  zones,
  photos,
}: ReserveDetailViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backHref = `/visites/${visit.id}?onglet=reserves`;

  async function changeStatus(status: ReserveStatus, message: string) {
    setBusy(true);
    setError(null);
    const result = await setReserveStatusAction({ reserveId: reserve.id, status });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast({ variant: "success", title: message });
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const result = await deleteReserveAction({ reserveId: reserve.id, visitId: visit.id });
    setBusy(false);
    if (!result.ok) {
      setDeleteOpen(false);
      setError(result.error);
      return;
    }
    toast({ variant: "success", title: `${reserve.code} supprimée` });
    router.push(backHref);
  }

  async function unplace() {
    setBusy(true);
    setError(null);
    const result = await removeReserveFromPlanAction({ reserveId: reserve.id });
    setBusy(false);
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  const done = reserve.status === "done";
  const markerHref = reserve.marker
    ? `/visites/${visit.id}?onglet=plans&plan=${reserve.marker.planId}&page=${reserve.marker.page}&repere=${reserve.marker.id}`
    : null;

  return (
    <div className="flex flex-col gap-6 py-6 md:py-8" data-testid="reserve-detail">
      <nav aria-label="Fil d'Ariane" className="text-ui text-ink-2">
        <Link
          href={`/visites/${visit.id}`}
          className="inline-flex min-h-11 items-center font-semibold text-brand-deep hover:underline"
        >
          {visit.title}
        </Link>
        <span aria-hidden="true"> › </span>
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center font-semibold text-brand-deep hover:underline"
        >
          Réserves
        </Link>
        <span aria-hidden="true"> › </span>
        <span className="text-ink">{reserve.code}</span>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-title text-ink" data-testid="reserve-code">
            {reserve.code}
          </h1>
          <ReserveStatusPill reserve={reserve} />
          <PriorityBadge priority={reserve.priority} />
        </div>
        <p className="text-title-sm text-ink" data-testid="reserve-detail-action">
          {reserve.action}
        </p>
        {reserve.isOverdue ? (
          <p className="text-body font-semibold text-status-open">
            {overdueLabel(reserve.daysOverdue)}
          </p>
        ) : null}
      </header>

      {error ? <ErrorNotice message={error} /> : null}

      {canEdit ? (
        <div className="flex flex-wrap gap-2" data-testid="reserve-actions">
          <Button type="button" variant="secondary" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" aria-hidden="true" />
            Modifier
          </Button>
          {done ? (
            <Button
              type="button"
              variant="secondary"
              loading={busy}
              onClick={() => void changeStatus("open", `${reserve.code} rouverte`)}
              data-testid="reserve-reopen"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Rouvrir
            </Button>
          ) : (
            <>
              <Button
                type="button"
                loading={busy}
                onClick={() => void changeStatus("done", `${reserve.code} levée`)}
                data-testid="reserve-close"
              >
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Lever
              </Button>
              {reserve.status === "in_progress" ? (
                <Button
                  type="button"
                  variant="secondary"
                  loading={busy}
                  onClick={() => void changeStatus("open", `${reserve.code} repassée en ouverte`)}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Repasser en ouverte
                </Button>
              ) : null}
            </>
          )}
          <Button asChild variant="secondary">
            <Link href={placeOnPlanHref(visit.id, reserve.id)} data-testid="reserve-place">
              <MapPinned className="size-4" aria-hidden="true" />
              {reserve.marker ? "Déplacer sur le plan" : "Placer sur le plan"}
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-status-open"
            onClick={() => setDeleteOpen(true)}
            data-testid="reserve-delete"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Supprimer
          </Button>
        </div>
      ) : (
        <p
          className="rounded-md bg-galet px-3 py-2 text-ui text-ink-2"
          data-testid="reserve-readonly"
        >
          {visit.status === "completed"
            ? "Visite terminée : la réserve est en lecture seule."
            : "Lecture seule : seuls les participants de la visite modifient ses réserves."}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <section className="rounded-lg border border-rule bg-paper p-4" aria-labelledby="infos">
            <h2 id="infos" className="mb-3 label-caps text-ink-2">
              Informations
            </h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-ui text-ink-2">Zone</dt>
                <dd className="text-body text-ink">{reserve.zoneLabel ?? "Sans zone"}</dd>
              </div>
              <div>
                <dt className="text-ui text-ink-2">Échéance</dt>
                <dd className="text-body text-ink">
                  {reserve.dueDate ? formatDate(reserve.dueDate, "long") : "Aucune"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-ui text-ink-2">Responsable</dt>
                <dd className="text-body text-ink" data-testid="reserve-responsible">
                  <ResponsibleText reserve={reserve} />
                  {reserve.responsibleKind === "external" ? (
                    <span className="block text-ui text-ink-2">
                      Entreprise extérieure
                      {reserve.responsibleEmail ? (
                        <>
                          {" · "}
                          <a
                            href={`mailto:${reserve.responsibleEmail}`}
                            className="font-semibold text-brand-deep underline"
                          >
                            {reserve.responsibleEmail}
                          </a>
                        </>
                      ) : null}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-ui text-ink-2">Créée</dt>
                <dd className="text-body text-ink">
                  {formatDate(reserve.createdAt)}
                  {reserve.createdByName ? ` par ${reserve.createdByName}` : ""}
                </dd>
              </div>
              {done && reserve.closedAt ? (
                <div>
                  <dt className="text-ui text-ink-2">Levée</dt>
                  <dd className="text-body text-ink">
                    {formatDate(reserve.closedAt)}
                    {reserve.closedByName ? ` par ${reserve.closedByName}` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
            {reserve.description ? (
              <div className="mt-4">
                <h3 className="text-ui text-ink-2">Description</h3>
                <p className="text-body whitespace-pre-wrap text-ink">{reserve.description}</p>
              </div>
            ) : null}
          </section>

          <section
            className="rounded-lg border border-rule bg-paper p-4"
            aria-labelledby="photos-defaut"
          >
            <h2 id="photos-defaut" className="mb-3 label-caps text-ink-2">
              Photos du défaut
            </h2>
            {reserve.photos.length === 0 ? (
              <p className="text-ui text-ink-2 italic">Aucune photo.</p>
            ) : (
              <ul
                className="grid grid-cols-3 gap-2 sm:grid-cols-4"
                data-testid="reserve-detail-photos"
              >
                {reserve.photos.map((photo) => (
                  <li key={photo.id}>
                    <Link
                      href={`/visites/${visit.id}?onglet=photos&photo=${photo.id}`}
                      className="block aspect-[4/3] overflow-hidden rounded-md bg-galet focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      aria-label={`Voir la photo : ${photo.caption ?? "Sans légende"}`}
                    >
                      {photo.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed URL
                        <img
                          src={photo.thumbUrl}
                          alt=""
                          width={160}
                          height={120}
                          className="size-full object-cover"
                        />
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-rule bg-paper p-4" aria-labelledby="plan">
            <h2 id="plan" className="mb-3 label-caps text-ink-2">
              Plan
            </h2>
            {reserve.marker && markerHref ? (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={markerHref}
                  className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand-deep underline"
                  data-testid="reserve-plan-link"
                >
                  <MapPinned className="size-4" aria-hidden="true" />
                  Voir sur le plan
                  {reserve.markerPlanName
                    ? ` : ${reserve.markerPlanName}, page ${reserve.marker.page}`
                    : ""}
                </Link>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void unplace()}
                  >
                    Retirer du plan
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-ui text-ink-2 italic">Non placée sur un plan.</p>
            )}
          </section>
        </div>

        <section
          className="self-start rounded-lg border border-rule bg-paper p-4"
          aria-labelledby="historique"
        >
          <h2 id="historique" className="mb-3 label-caps text-ink-2">
            Historique
          </h2>
          <ol className="flex flex-col gap-3" data-testid="reserve-history">
            {history.flatMap((entry) =>
              historyLines(entry).map((line, index) => (
                <li
                  key={`${entry.id}-${index}`}
                  className="border-l-2 border-rule pl-3 text-ui text-ink"
                >
                  {line}
                </li>
              )),
            )}
          </ol>
        </section>
      </div>

      {canEdit ? (
        <ReserveSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          target={{ kind: "edit", reserve }}
          visitId={visit.id}
          siteId={visit.siteId}
          zones={zones}
          photos={photos}
          onSaved={(saved) => {
            setEditOpen(false);
            toast({ variant: "success", title: `${saved.code} enregistrée` });
            router.refresh();
          }}
        />
      ) : null}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer {reserve.code} ?</DialogTitle>
            <DialogDescription>
              « {reserve.action} » sera retirée de la visite
              {reserve.marker ? ", ainsi que son repère sur le plan" : ""}. Son numéro ne sera pas
              réattribué.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="danger"
              loading={busy}
              onClick={() => void remove()}
              data-testid="reserve-delete-confirm"
            >
              Supprimer {reserve.code}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
