"use client";

import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import { useState } from "react";

import { ErrorNotice } from "@/components/auth/error-notice";
import { Badge } from "@/components/ui/badge";
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
import { Select } from "@/components/ui/select";
import { REMOVE_NOT_EMPTY_MESSAGE } from "@/lib/notes/messages";
import { ZONE_LABEL_MAX_LENGTH, type ZoneTemplate } from "@/server/domain/templates";

export interface ManageZoneItem {
  id: string;
  zoneKey: string;
  zoneLabel: string;
  filled: boolean;
}

export interface ManageZonesDialogProps {
  zones: ManageZoneItem[];
  /** Zones of the template that the visit does not have (any more). */
  missingTemplateZones: ZoneTemplate[];
  pending: boolean;
  onClose: () => void;
  onMove: (id: string, delta: -1 | 1) => Promise<string | null>;
  onRename: (id: string, label: string) => Promise<string | null>;
  onRemove: (id: string) => Promise<string | null>;
  onAdd: (label: string) => Promise<string | null>;
  onAddTemplate: (zoneKey: string) => Promise<string | null>;
}

/**
 * « Gérer les zones »: reorder with 44 px arrows, rename, remove (only empty zones), add a
 * zone with a free label and put back a template zone. Every operation sends the visit
 * version; a conflict closes the dialog and shows the step 5 notice.
 */
export function ManageZonesDialog({
  zones,
  missingTemplateZones,
  pending,
  onClose,
  onMove,
  onRename,
  onRemove,
  onAdd,
  onAddTemplate,
}: ManageZonesDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [templateKey, setTemplateKey] = useState(missingTemplateZones[0]?.key ?? "");

  async function run(operation: () => Promise<string | null>, onSuccess?: () => void) {
    setError(null);
    const message = await operation();
    if (message) setError(message);
    else onSuccess?.();
  }

  const selectedTemplate = missingTemplateZones.some((zone) => zone.key === templateKey)
    ? templateKey
    : (missingTemplateZones[0]?.key ?? "");

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-2xl" hideCloseButton data-testid="manage-zones">
        <DialogHeader>
          <DialogTitle>Gérer les zones</DialogTitle>
          <DialogDescription>
            Réordonnez, renommez, retirez une zone vide, ajoutez une zone ou remettez une zone de la
            trame. Les clés des zones de la trame ne changent jamais.
          </DialogDescription>
        </DialogHeader>
        {error ? <ErrorNotice message={error} /> : null}

        <ol className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto" aria-label="Zones">
          {zones.map((zone, index) => (
            <li
              key={zone.id}
              className="flex flex-col gap-2 rounded-md border border-rule bg-paper p-2 sm:flex-row sm:items-center"
              data-testid="manage-zone"
            >
              {renaming?.id === zone.id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(
                      () => onRename(zone.id, renaming.label),
                      () => setRenaming(null),
                    );
                  }}
                >
                  <Input
                    aria-label={`Nouveau libellé de ${zone.zoneLabel}`}
                    value={renaming.label}
                    maxLength={ZONE_LABEL_MAX_LENGTH}
                    onChange={(event) => setRenaming({ id: zone.id, label: event.target.value })}
                    autoFocus
                  />
                  <Button type="submit" aria-label="Valider le libellé" loading={pending}>
                    <Check className="size-5" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Annuler le renommage"
                    onClick={() => setRenaming(null)}
                  >
                    <X className="size-5" aria-hidden="true" />
                  </Button>
                </form>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-body font-semibold text-ink">
                    {zone.zoneLabel}
                  </span>
                  <Badge variant={zone.filled ? "brand" : "neutral"}>
                    {zone.filled ? "Renseignée" : "Vide"}
                  </Badge>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Monter ${zone.zoneLabel}`}
                  disabled={pending || index === 0}
                  onClick={() => void run(() => onMove(zone.id, -1))}
                >
                  <ArrowUp className="size-5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Descendre ${zone.zoneLabel}`}
                  disabled={pending || index === zones.length - 1}
                  onClick={() => void run(() => onMove(zone.id, 1))}
                >
                  <ArrowDown className="size-5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Renommer ${zone.zoneLabel}`}
                  disabled={pending}
                  onClick={() => setRenaming({ id: zone.id, label: zone.zoneLabel })}
                >
                  <Pencil className="size-5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Retirer ${zone.zoneLabel}`}
                  disabled={pending || zone.filled}
                  aria-disabled={zone.filled || undefined}
                  title={zone.filled ? REMOVE_NOT_EMPTY_MESSAGE : undefined}
                  onClick={() => void run(() => onRemove(zone.id))}
                >
                  <Trash2 className="size-5" aria-hidden="true" />
                </Button>
              </div>
              {zone.filled ? (
                <p className="text-label text-ink-2 sm:hidden">{REMOVE_NOT_EMPTY_MESSAGE}</p>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="text-ui text-ink-2">
          Une zone renseignée ne peut pas être retirée : {REMOVE_NOT_EMPTY_MESSAGE.toLowerCase()}
        </p>

        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () => onAdd(newLabel),
              () => setNewLabel(""),
            );
          }}
        >
          <Field id="new-zone-label" label="Ajouter une zone" className="flex-1">
            {(control) => (
              <Input
                {...control}
                value={newLabel}
                maxLength={ZONE_LABEL_MAX_LENGTH}
                placeholder="Libellé, par exemple Local sprinkler"
                onChange={(event) => setNewLabel(event.target.value)}
              />
            )}
          </Field>
          <Button type="submit" variant="secondary" loading={pending}>
            <Plus className="size-5" aria-hidden="true" />
            Ajouter
          </Button>
        </form>

        {missingTemplateZones.length > 0 ? (
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (selectedTemplate) void run(() => onAddTemplate(selectedTemplate));
            }}
          >
            <Field id="template-zone" label="Remettre une zone de la trame" className="flex-1">
              {(control) => (
                <Select
                  {...control}
                  value={selectedTemplate}
                  onChange={(event) => setTemplateKey(event.target.value)}
                >
                  {missingTemplateZones.map((zone) => (
                    <option key={zone.key} value={zone.key}>
                      {zone.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button type="submit" variant="secondary" loading={pending}>
              <Undo2 className="size-5" aria-hidden="true" />
              Remettre
            </Button>
          </form>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Fermer
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
