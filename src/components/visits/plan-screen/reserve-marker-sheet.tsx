"use client";

import { ExternalLink, Move, Pencil } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { reserveHref } from "@/lib/reserves/links";
import { RESERVE_STATUS_LABELS } from "@/server/domain/enums";
import type { MarkerReserveRef } from "@/server/plans/types";

import { SheetPanel } from "./sheet-panel";

/**
 * Sheet of a reserve marker on the plan screen (step 12 b): code, action and status with its
 * label, « Modifier » (reserve sheet), « Déplacer » (next tap on the plan) and « Ouvrir la
 * réserve » (detail with its history). Read-only: the summary and the link.
 */
export function ReserveMarkerSheet({
  visitId,
  reserve,
  where,
  canEdit,
  moving,
  onEdit,
  onStartMove,
  onClose,
}: {
  visitId: string;
  reserve: MarkerReserveRef;
  where: string;
  canEdit: boolean;
  moving: boolean;
  onEdit: () => void;
  onStartMove: () => void;
  onClose: () => void;
}) {
  return (
    <SheetPanel
      title={`${reserve.code} · ${reserve.action}`}
      subtitle={where}
      onClose={onClose}
      closeLabel="Fermer la réserve"
      testId="reserve-marker-sheet"
    >
      <p className="text-ui text-ink" data-testid="reserve-marker-status">
        Statut : <strong>{RESERVE_STATUS_LABELS[reserve.status]}</strong>
        {reserve.isOverdue && reserve.status !== "done" ? " · en retard" : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <>
            <Button type="button" onClick={onEdit} data-testid="reserve-marker-edit">
              <Pencil className="size-5" aria-hidden="true" />
              Modifier
            </Button>
            <Button
              type="button"
              variant={moving ? "primary" : "secondary"}
              aria-pressed={moving}
              onClick={onStartMove}
              data-testid="reserve-marker-move"
            >
              <Move className="size-5" aria-hidden="true" />
              {moving ? "Touchez le plan" : "Déplacer"}
            </Button>
          </>
        ) : null}
        <Button asChild variant="secondary">
          <Link href={reserveHref(visitId, reserve.id)} data-testid="reserve-marker-open">
            <ExternalLink className="size-5" aria-hidden="true" />
            Ouvrir la réserve
          </Link>
        </Button>
      </div>
    </SheetPanel>
  );
}
