"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";

import { NoteContent } from "@/components/visits/notes/note-content";
import { mergedDraft } from "@/components/visits/notes/note-conflict-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { NOTE_MAX_LENGTH, parseNoteContent } from "@/lib/notes/format";
import type { ConflictEntry } from "@/lib/offline/db";
import type { SyncKind } from "@/lib/offline/ops";
import type { NewOperation } from "@/lib/offline/outbox";
import type { VisitView } from "@/lib/offline/snapshot";
import { type ReserveFormValues, reserveToForm } from "@/lib/reserves/schema";
import {
  RESERVE_PRIORITY_LABELS,
  VISIT_REASON_LABELS,
  VISIT_TYPE_LABELS,
} from "@/server/domain/enums";
import type { VisitUpdate } from "@/server/domain";
import type { ReserveDetail } from "@/server/reserves/types";

import { useOptionalOffline } from "./offline-provider";

/** One field that differs between my version and the server's. */
export interface FieldChoice<T> {
  key: string;
  label: string;
  mine: string;
  theirs: string;
  /** Applies « mine » or « theirs » for this field onto the result. */
  apply: (target: T, source: "mine" | "theirs") => T;
}

const NONE = "—";

function responsibleText(values: ReserveFormValues, names: Map<string, string>): string {
  switch (values.responsibleMode) {
    case "internal":
      return names.get(values.responsibleProfileId) ?? "Compte interne";
    case "external":
      return [values.responsibleName, values.responsibleCompany, values.responsibleEmail]
        .filter(Boolean)
        .join(" · ");
    default:
      return "À désigner";
  }
}

/** Fields of a reserve that differ, with how to take each side. */
export function reserveChoices(
  mine: ReserveFormValues,
  theirs: ReserveFormValues,
  context: { zones: Map<string, string>; names: Map<string, string> },
): FieldChoice<ReserveFormValues>[] {
  const pick =
    <K extends keyof ReserveFormValues>(...keys: K[]) =>
    (target: ReserveFormValues, source: "mine" | "theirs") => {
      const from = source === "mine" ? mine : theirs;
      const next = { ...target };
      for (const key of keys) next[key] = from[key];
      return next;
    };
  const choices: FieldChoice<ReserveFormValues>[] = [
    {
      key: "action",
      label: "Action",
      mine: mine.action,
      theirs: theirs.action,
      apply: pick("action"),
    },
    {
      key: "description",
      label: "Description",
      mine: mine.description || NONE,
      theirs: theirs.description || NONE,
      apply: pick("description"),
    },
    {
      key: "zoneKey",
      label: "Zone",
      mine: context.zones.get(mine.zoneKey) ?? (mine.zoneKey || "Sans zone"),
      theirs: context.zones.get(theirs.zoneKey) ?? (theirs.zoneKey || "Sans zone"),
      apply: pick("zoneKey"),
    },
    {
      key: "priority",
      label: "Priorité",
      mine: RESERVE_PRIORITY_LABELS[mine.priority],
      theirs: RESERVE_PRIORITY_LABELS[theirs.priority],
      apply: pick("priority"),
    },
    {
      key: "dueDate",
      label: "Échéance",
      mine: mine.dueDate ? formatDate(mine.dueDate) : "Aucune",
      theirs: theirs.dueDate ? formatDate(theirs.dueDate) : "Aucune",
      apply: pick("dueDate"),
    },
    {
      key: "responsible",
      label: "Responsable",
      mine: responsibleText(mine, context.names),
      theirs: responsibleText(theirs, context.names),
      apply: pick(
        "responsibleMode",
        "responsibleProfileId",
        "responsibleName",
        "responsibleCompany",
        "responsibleEmail",
      ),
    },
    {
      key: "photoIds",
      label: "Photos du défaut",
      mine: `${mine.photoIds.length} photo${mine.photoIds.length > 1 ? "s" : ""}`,
      theirs: `${theirs.photoIds.length} photo${theirs.photoIds.length > 1 ? "s" : ""}`,
      apply: pick("photoIds"),
    },
  ];
  return choices.filter((choice) => {
    if (choice.key === "photoIds") {
      return [...mine.photoIds].sort().join() !== [...theirs.photoIds].sort().join();
    }
    return choice.mine !== choice.theirs;
  });
}

/** Fields of the visit information that differ. */
export function visitChoices(
  mine: VisitUpdate,
  theirs: VisitView,
  names: Map<string, string>,
): FieldChoice<VisitUpdate>[] {
  const server: VisitUpdate = {
    type: theirs.type,
    reason: theirs.reason,
    title: theirs.title,
    visitDate: theirs.visitDate,
    subject: theirs.subject,
    writerId: theirs.writerId,
  };
  const pick =
    <K extends keyof VisitUpdate>(...keys: K[]) =>
    (target: VisitUpdate, source: "mine" | "theirs") => {
      const from = source === "mine" ? mine : server;
      const next = { ...target };
      for (const key of keys) next[key] = from[key];
      return next;
    };
  const choices: FieldChoice<VisitUpdate>[] = [
    { key: "title", label: "Titre", mine: mine.title, theirs: server.title, apply: pick("title") },
    {
      key: "typeReason",
      label: "Type et motif",
      mine: `${VISIT_TYPE_LABELS[mine.type]} · ${VISIT_REASON_LABELS[mine.reason]}`,
      theirs: `${VISIT_TYPE_LABELS[server.type]} · ${VISIT_REASON_LABELS[server.reason]}`,
      apply: pick("type", "reason"),
    },
    {
      key: "visitDate",
      label: "Date",
      mine: formatDate(mine.visitDate),
      theirs: formatDate(server.visitDate),
      apply: pick("visitDate"),
    },
    {
      key: "writerId",
      label: "Rédacteur",
      mine: mine.writerId ? (names.get(mine.writerId) ?? "Compte") : "Aucun",
      theirs: server.writerId ? (names.get(server.writerId) ?? "Compte") : "Aucun",
      apply: pick("writerId"),
    },
    {
      key: "subject",
      label: "Objet",
      mine: mine.subject ?? NONE,
      theirs: server.subject ?? NONE,
      apply: pick("subject"),
    },
  ];
  return choices.filter((choice) => choice.mine !== choice.theirs);
}

/** A field-by-field arbitration: one radio group per differing field. */
function FieldTable<T>({
  choices,
  value,
  onChange,
}: {
  choices: FieldChoice<T>[];
  value: Record<string, "mine" | "theirs">;
  onChange: (key: string, source: "mine" | "theirs") => void;
}) {
  if (choices.length === 0) {
    return (
      <p className="text-ui text-ink-2">
        Les deux versions sont identiques : votre modification peut être abandonnée sans perte.
      </p>
    );
  }
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse text-ui" data-testid="arbitration-fields">
        <caption className="sr-only">Champs qui diffèrent entre votre saisie et le serveur</caption>
        <thead>
          <tr className="text-left text-ink-2">
            <th scope="col" className="py-2 pr-3 font-semibold">
              Champ
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Votre saisie
            </th>
            <th scope="col" className="py-2 font-semibold">
              Version du serveur
            </th>
          </tr>
        </thead>
        <tbody>
          {choices.map((choice) => (
            <tr key={choice.key} className="border-t border-rule align-top">
              <th scope="row" className="py-2 pr-3 text-left font-semibold text-ink">
                {choice.label}
              </th>
              {(["mine", "theirs"] as const).map((source) => (
                <td key={source} className="py-2 pr-3">
                  <label className="flex min-h-11 cursor-pointer items-start gap-2">
                    <input
                      type="radio"
                      className="mt-1 size-5 shrink-0 accent-brand"
                      name={`choice-${choice.key}`}
                      checked={value[choice.key] === source}
                      onChange={() => onChange(choice.key, source)}
                      data-testid={`arbitration-${choice.key}-${source}`}
                    />
                    <span className="break-words whitespace-pre-wrap text-ink">
                      {source === "mine" ? choice.mine : choice.theirs}
                    </span>
                  </label>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * « À arbitrer »: a change of the device that the server could not apply because the same
 * thing changed meanwhile. The server version stays in place until the user decides:
 * - a note: both texts side by side, « Garder la mienne », « Garder celle du serveur » or
 *   « Fusionner » (field prefilled with both texts);
 * - a reserve or the visit information: the fields that differ, one choice per field;
 * - anything else (participants, zones): apply my change again on the server version, or drop it.
 * The decision is queued with the version of the server.
 */
export function ArbitrationDialog() {
  const offline = useOptionalOffline();
  const db = offline?.db ?? null;
  const conflictId = offline?.arbitrating ?? null;
  const conflict = useLiveQuery(
    async () => (db && conflictId ? ((await db.conflicts.get(conflictId)) ?? null) : null),
    [db, conflictId],
  );
  const context = useLiveQuery(async () => {
    if (!db || !conflict) return null;
    const [visit, notes] = await Promise.all([
      db.visits.get(conflict.visitId),
      db.notes.where("visitId").equals(conflict.visitId).toArray(),
    ]);
    return { visit, notes };
  }, [db, conflict?.id]);
  const { toast } = useToast();
  const [choices, setChoices] = useState<Record<string, "mine" | "theirs">>({});
  const [merging, setMerging] = useState(false);
  const [merged, setMerged] = useState("");
  const [busy, setBusy] = useState(false);

  const names = useMemo(
    () => new Map((context?.visit?.writers ?? []).map((w) => [w.id, w.fullName])),
    [context?.visit?.writers],
  );
  const zones = useMemo(
    () => new Map((context?.notes ?? []).map((n) => [n.zoneKey, n.zoneLabel])),
    [context?.notes],
  );

  const reserveDiff = useMemo(() => {
    if (!conflict || conflict.kind !== "reserve.update") return null;
    const mine = (conflict.mine as { values: ReserveFormValues }).values;
    const current = (conflict.theirs as { reserve?: ReserveDetail }).reserve;
    if (!current) return null;
    const theirs = reserveToForm({ ...current, photoIds: current.photos.map((p) => p.id) });
    return { mine, theirs, choices: reserveChoices(mine, theirs, { zones, names }) };
  }, [conflict, zones, names]);

  const visitDiff = useMemo(() => {
    if (!conflict || conflict.kind !== "visit.update") return null;
    const mine = (conflict.mine as { patch: VisitUpdate }).patch;
    const current = (conflict.theirs as { visit?: VisitView | null }).visit;
    if (!current) return null;
    return { mine, theirs: current, choices: visitChoices(mine, current, names) };
  }, [conflict, names]);

  useEffect(() => {
    setChoices({});
    setMerging(false);
    if (conflict?.kind === "note.update") {
      setMerged(
        mergedDraft(
          String((conflict.theirs as { content?: string }).content ?? ""),
          String((conflict.mine as { content?: string }).content ?? ""),
        ),
      );
    }
  }, [conflict?.id, conflict?.kind, conflict?.mine, conflict?.theirs]);

  if (!offline || !conflictId) return null;
  const { engine, setArbitrating } = offline;
  const close = () => setArbitrating(null);

  async function resolve(entry: ConflictEntry, operation: NewOperation | null, message: string) {
    if (!engine) return;
    setBusy(true);
    try {
      await engine.resolveConflict(entry, operation);
      toast({ variant: "success", title: message });
      close();
    } finally {
      setBusy(false);
    }
  }

  function again(entry: ConflictEntry, payload: unknown): NewOperation {
    return {
      visitId: entry.visitId,
      kind: entry.kind as SyncKind,
      entityId: entry.entityId,
      payload: payload as never,
      baseVersion: entry.serverVersion,
      versionScope: entry.versionScope,
      label: entry.label,
    };
  }

  const choose = (key: string, source: "mine" | "theirs") =>
    setChoices((current) => ({ ...current, [key]: source }));

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;
  if (conflict === undefined) {
    body = <p className="text-ui text-ink-2">Chargement…</p>;
  } else if (conflict === null) {
    body = <p className="text-ui text-ink-2">Ce conflit a déjà été arbitré.</p>;
    footer = (
      <Button type="button" variant="secondary" onClick={close}>
        Fermer
      </Button>
    );
  } else if (conflict.kind === "note.update") {
    const mine = String((conflict.mine as { content?: string }).content ?? "");
    const theirs = conflict.theirs as { content?: string; updatedByName?: string | null };
    const blocks = parseNoteContent(String(theirs.content ?? ""));
    body = merging ? (
      <label className="flex flex-col gap-2">
        <span className="label-caps text-ink-2">Texte fusionné</span>
        <Textarea
          value={merged}
          rows={10}
          maxLength={NOTE_MAX_LENGTH}
          onChange={(event) => setMerged(event.target.value)}
          data-testid="arbitration-merge-text"
        />
      </label>
    ) : (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="label-caps text-ink-2">Votre texte</p>
          <pre
            className="max-h-72 overflow-y-auto rounded-md border border-brand bg-brand-tint px-3.5 py-3 font-sans text-body whitespace-pre-wrap text-ink"
            data-testid="arbitration-mine"
          >
            {mine || "Aucune observation"}
          </pre>
        </div>
        <div className="flex flex-col gap-2">
          <p className="label-caps text-ink-2">
            Version du serveur{theirs.updatedByName ? ` (${theirs.updatedByName})` : ""}
          </p>
          <div
            className="max-h-72 overflow-y-auto rounded-md border border-rule bg-craie px-3.5 py-3"
            data-testid="arbitration-theirs"
          >
            {blocks.length > 0 ? (
              <NoteContent blocks={blocks} />
            ) : (
              <p className="text-body text-ink-2 italic">Aucune observation</p>
            )}
          </div>
        </div>
      </div>
    );
    const noteOp = (content: string) => again(conflict, { noteId: conflict.entityId, content });
    footer = merging ? (
      <>
        <Button type="button" variant="secondary" onClick={() => setMerging(false)}>
          Retour
        </Button>
        <Button
          type="button"
          loading={busy}
          onClick={() => void resolve(conflict, noteOp(merged), "Texte fusionné enregistré")}
          data-testid="arbitration-merge-save"
        >
          Enregistrer la fusion
        </Button>
      </>
    ) : (
      <>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void resolve(conflict, null, "Version du serveur gardée")}
          data-testid="arbitration-theirs-keep"
        >
          Garder celle du serveur
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => setMerging(true)}
          data-testid="arbitration-merge"
        >
          Fusionner
        </Button>
        <Button
          type="button"
          loading={busy}
          onClick={() => void resolve(conflict, noteOp(mine), "Votre texte est gardé")}
          data-testid="arbitration-mine-keep"
        >
          Garder la mienne
        </Button>
      </>
    );
  } else if (reserveDiff || visitDiff) {
    const diff = (reserveDiff ?? visitDiff)!;
    body = (
      <FieldTable
        choices={diff.choices as FieldChoice<unknown>[]}
        value={Object.fromEntries(
          diff.choices.map((choice) => [choice.key, choices[choice.key] ?? "mine"]),
        )}
        onChange={choose}
      />
    );
    const build = () => {
      if (reserveDiff) {
        let values = reserveDiff.theirs;
        for (const choice of reserveDiff.choices) {
          values = choice.apply(values, choices[choice.key] ?? "mine");
        }
        return again(conflict, { id: conflict.entityId, values });
      }
      const server = visitDiff!.theirs;
      let patch: VisitUpdate = {
        type: server.type,
        reason: server.reason,
        title: server.title,
        visitDate: server.visitDate,
        subject: server.subject,
        writerId: server.writerId,
      };
      for (const choice of visitDiff!.choices) {
        patch = choice.apply(patch, choices[choice.key] ?? "mine");
      }
      return again(conflict, { patch });
    };
    footer = (
      <>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void resolve(conflict, null, "Version du serveur gardée")}
          data-testid="arbitration-theirs-keep"
        >
          Garder la version du serveur
        </Button>
        <Button
          type="button"
          loading={busy}
          disabled={diff.choices.length === 0}
          onClick={() => void resolve(conflict, build(), "Votre choix est enregistré")}
          data-testid="arbitration-apply"
        >
          Enregistrer ce choix
        </Button>
      </>
    );
  } else {
    body = (
      <p className="text-ui text-ink">
        « {conflict.label} » n&apos;a pas pu être appliqué : la visite a changé entre-temps. Vous
        pouvez l&apos;appliquer à nouveau sur la version actuelle, ou l&apos;abandonner.
      </p>
    );
    footer = (
      <>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void resolve(conflict, null, "Modification abandonnée")}
          data-testid="arbitration-theirs-keep"
        >
          Abandonner ma modification
        </Button>
        <Button
          type="button"
          loading={busy}
          onClick={() =>
            void resolve(
              conflict,
              again(conflict, conflict.mine),
              "Modification appliquée à nouveau",
            )
          }
          data-testid="arbitration-apply"
        >
          Appliquer à nouveau
        </Button>
      </>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent
        className="max-h-[90dvh] max-w-3xl overflow-y-auto"
        data-testid="arbitration-dialog"
      >
        <DialogHeader>
          <DialogTitle>À arbitrer : {conflict?.label ?? "modification"}</DialogTitle>
          <DialogDescription>
            {conflict?.message ?? ""} Rien n&apos;est perdu : la version du serveur reste en place
            tant que vous n&apos;avez pas choisi.
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter className="flex-wrap">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
