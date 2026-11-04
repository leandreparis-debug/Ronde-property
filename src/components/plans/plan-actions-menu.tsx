"use client";

import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import { useId, useState } from "react";

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
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { renamePlanAction, setPlanArchivedAction } from "@/server/actions/plan-actions";
import { PLAN_NAME_MAX_LENGTH } from "@/server/domain/plans";
import type { PlanView } from "@/server/plans/types";

/**
 * « Renommer » and « Archiver » / « Désarchiver » for rt / admin, each confirmed in a dialog.
 * An archived plan is no longer offered for new markers; existing markers keep showing it.
 */
export function PlanActionsMenu({
  plan,
  onChanged,
}: {
  plan: PlanView;
  onChanged: (plan: PlanView) => void;
}) {
  const id = useId();
  const [dialog, setDialog] = useState<"rename" | "archive" | null>(null);
  const [name, setName] = useState(plan.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(
    operation: () => Promise<{ ok: true; plan: PlanView } | { ok: false; error: string }>,
  ) {
    setPending(true);
    setError(null);
    try {
      const result = await operation();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChanged(result.plan);
      setDialog(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setName(plan.name);
          setError(null);
          setDialog("rename");
        }}
        aria-label={`Renommer le plan ${plan.name}`}
      >
        <Pencil className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Renommer</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setError(null);
          setDialog("archive");
        }}
        aria-label={`${plan.isArchived ? "Désarchiver" : "Archiver"} le plan ${plan.name}`}
        data-testid="archive-plan"
      >
        {plan.isArchived ? (
          <ArchiveRestore className="size-4" aria-hidden="true" />
        ) : (
          <Archive className="size-4" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">{plan.isArchived ? "Désarchiver" : "Archiver"}</span>
      </Button>

      <Dialog open={dialog === "rename"} onOpenChange={(open) => setDialog(open ? "rename" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renommer le plan</DialogTitle>
            <DialogDescription>
              Le nouveau nom s&apos;affiche dans toutes les visites du site.
            </DialogDescription>
          </DialogHeader>
          <Field id={`${id}-name`} label="Nom du plan" required>
            {(control) => (
              <Input
                {...control}
                value={name}
                maxLength={PLAN_NAME_MAX_LENGTH}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          {error ? <ErrorNotice message={error} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <Button
              type="button"
              loading={pending}
              onClick={() => void run(() => renamePlanAction({ planId: plan.id, name }))}
            >
              Renommer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "archive"}
        onOpenChange={(open) => setDialog(open ? "archive" : null)}
      >
        <DialogContent data-testid="archive-plan-dialog">
          <DialogHeader>
            <DialogTitle>
              {plan.isArchived ? "Désarchiver le plan ?" : "Archiver le plan ?"}
            </DialogTitle>
            <DialogDescription>
              {plan.isArchived
                ? "Le plan sera de nouveau proposé pour placer des repères."
                : "Le plan ne sera plus proposé pour de nouveaux repères. Les visites qui y ont déjà des repères continuent de l'afficher."}
            </DialogDescription>
          </DialogHeader>
          {error ? <ErrorNotice message={error} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <Button
              type="button"
              loading={pending}
              onClick={() =>
                void run(() =>
                  setPlanArchivedAction({ planId: plan.id, archived: !plan.isArchived }),
                )
              }
              data-testid="confirm-archive-plan"
            >
              {plan.isArchived ? "Désarchiver" : "Archiver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
