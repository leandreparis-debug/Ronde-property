"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { PendingDot } from "@/components/offline/pending-dot";
import { type MutationResult, useVisitMutations } from "@/components/offline/visit-mutations";
import { participantInputSchema } from "@/server/domain/schemas";
import type { Participant } from "@/server/domain";
import type { AssignableProfile } from "@/server/repositories/profile-repository";

import { useVisitVersion } from "./visit-version-context";

export interface ParticipantsPanelProps {
  visitId: string;
  /** Participants from the local store, in order. */
  participants: Participant[];
  colleagues: AssignableProfile[];
  canEdit: boolean;
  /** Participants with an operation waiting (« en attente » marks). */
  pendingIds?: Set<string>;
}

/** Ordered participants with presence toggle, reorder arrows, removal and the add dialog. */
export function ParticipantsPanel({
  visitId,
  participants,
  colleagues,
  canEdit,
  pendingIds = new Set(),
}: ParticipantsPanelProps) {
  const { conflict, setConflict } = useVisitVersion();
  const mutations = useVisitMutations(visitId);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Participant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function handle(result: MutationResult, onSuccess: () => void): boolean {
    if (result.ok) {
      setError(null);
      onSuccess();
      return true;
    }
    if (result.conflict) setConflict({ message: result.error, entry: result.conflict });
    else setError(result.error);
    return false;
  }

  function togglePresence(participant: Participant) {
    startTransition(async () => {
      const result = await mutations.setParticipantPresence(
        participant.id,
        !participant.isPresent,
        participant.fullName,
      );
      handle(result, () => undefined);
    });
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= participants.length) return;
    const next = [...participants];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    startTransition(async () => {
      const result = await mutations.reorderParticipants(next.map((p) => p.id));
      handle(result, () => undefined);
    });
  }

  function remove(participant: Participant) {
    startTransition(async () => {
      const result = await mutations.removeParticipant(participant.id, participant.fullName);
      handle(result, () => {
        setRemoving(null);
        toast({ variant: "success", title: "Participant retiré" });
      });
    });
  }

  const disabled = !canEdit || Boolean(conflict) || isPending;
  const linkedIds = new Set(participants.map((p) => p.profileId).filter(Boolean));

  return (
    <section id="participants" aria-labelledby="participants-title" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 id="participants-title" className="font-display text-title-sm">
          Participants
        </h3>
        {canEdit ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setAdding(true)}
            disabled={Boolean(conflict)}
          >
            <Plus className="size-5" aria-hidden="true" />
            Ajouter un participant
          </Button>
        ) : null}
      </div>
      {error ? <ErrorNotice message={error} /> : null}
      {participants.length === 0 ? (
        <p className="rounded-md border border-dashed border-rule px-4 py-6 text-center text-ui text-ink-2">
          Aucun participant
        </p>
      ) : (
        <ol className="@container flex flex-col gap-2" aria-label="Participants">
          {participants.map((participant, index) => (
            <li
              key={participant.id}
              className="flex flex-col gap-3 rounded-md border border-rule bg-paper p-3 @lg:flex-row @lg:items-center"
              data-testid="participant"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink">
                  {participant.fullName}
                  {participant.profileId ? <Badge variant="brand">Collègue</Badge> : null}
                  {pendingIds.has(participant.id) ? <PendingDot /> : null}
                </span>
                <span className="text-ui text-ink-2">
                  {[participant.company, participant.jobTitle, participant.email]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={participant.isPresent}
                  disabled={disabled}
                  onClick={() => togglePresence(participant)}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 rounded-pill border px-3.5 text-ui font-semibold disabled:opacity-60",
                    participant.isPresent
                      ? "border-brand bg-brand-soft text-brand-deep"
                      : "border-rule bg-craie text-ink-2",
                  )}
                >
                  <span
                    className={cn(
                      "size-2.5 rounded-pill",
                      participant.isPresent ? "bg-brand" : "bg-ink-2",
                    )}
                    aria-hidden="true"
                  />
                  {participant.isPresent ? "Présent" : "Absent"}
                </button>
                {canEdit ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Monter ${participant.fullName}`}
                      disabled={disabled || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="size-5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Descendre ${participant.fullName}`}
                      disabled={disabled || index === participants.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="size-5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Retirer ${participant.fullName}`}
                      disabled={disabled}
                      onClick={() => setRemoving(participant)}
                    >
                      <Trash2 className="size-5" aria-hidden="true" />
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      {adding ? (
        <AddParticipantDialog
          visitId={visitId}
          colleagues={colleagues.filter((c) => !linkedIds.has(c.id))}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            toast({ variant: "success", title: "Participant ajouté" });
          }}
        />
      ) : null}

      {removing ? (
        <Dialog open onOpenChange={(open) => (open ? undefined : setRemoving(null))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Retirer ce participant ?</DialogTitle>
              <DialogDescription>
                {removing.fullName} ne figurera plus dans la visite.
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
                loading={isPending}
                onClick={() => remove(removing)}
              >
                Retirer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}

function AddParticipantDialog({
  visitId,
  colleagues,
  onClose,
  onAdded,
}: {
  visitId: string;
  colleagues: AssignableProfile[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const { setConflict } = useVisitVersion();
  const mutations = useVisitMutations(visitId);
  const [mode, setMode] = useState<"colleague" | "external">("colleague");
  const [profileId, setProfileId] = useState(colleagues[0]?.id ?? "");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function submit() {
    const colleague = colleagues.find((c) => c.id === profileId);
    const participant =
      mode === "colleague"
        ? {
            profileId: colleague?.id ?? null,
            fullName: colleague?.fullName ?? "",
            company: null,
            jobTitle: null,
            email: null,
            isPresent: true,
            sortOrder: 0,
          }
        : {
            profileId: null,
            fullName,
            company: company || null,
            jobTitle: jobTitle || null,
            email: email || null,
            isPresent: true,
            sortOrder: 0,
          };
    if (mode === "colleague" && !colleague) {
      setError("Choisissez un collègue.");
      return;
    }
    // Same rules as the server, checked before queueing (e-mail, lengths).
    const parsed = participantInputSchema.safeParse(participant);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!next[key]) next[key] = issue.message;
      }
      setFields(next);
      setError("Vérifiez les champs signalés.");
      return;
    }
    startTransition(async () => {
      const result = await mutations.addParticipant(parsed.data);
      if (result.ok) {
        onAdded();
      } else if (result.conflict) {
        setConflict({ message: result.error, entry: result.conflict });
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un participant</DialogTitle>
          <DialogDescription>
            Un collègue RONDE lié à son compte peut ensuite modifier la visite.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(value) => setMode(value as "colleague" | "external")}>
          <TabsList aria-label="Type de participant">
            <TabsTrigger value="colleague">Collègue RONDE</TabsTrigger>
            <TabsTrigger value="external">Personne extérieure</TabsTrigger>
          </TabsList>
          <TabsContent value="colleague" className="flex flex-col gap-4">
            {colleagues.length === 0 ? (
              <p className="text-ui text-ink-2">Tous les collègues disponibles participent déjà.</p>
            ) : (
              <Field
                id="participant-profile"
                label="Collègue"
                required
                hint="Le collègue pourra modifier la visite."
              >
                {(control) => (
                  <Select
                    {...control}
                    value={profileId}
                    onChange={(event) => setProfileId(event.target.value)}
                  >
                    {colleagues.map((colleague) => (
                      <option key={colleague.id} value={colleague.id}>
                        {colleague.fullName}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </TabsContent>
          <TabsContent value="external" className="flex flex-col gap-4">
            <Field id="participant-name" label="Nom" required error={fields.fullName}>
              {(control) => (
                <Input
                  {...control}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  maxLength={200}
                />
              )}
            </Field>
            <Field id="participant-company" label="Entreprise" error={fields.company}>
              {(control) => (
                <Input
                  {...control}
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  maxLength={200}
                />
              )}
            </Field>
            <Field id="participant-job" label="Fonction" error={fields.jobTitle}>
              {(control) => (
                <Input
                  {...control}
                  value={jobTitle}
                  onChange={(event) => setJobTitle(event.target.value)}
                  maxLength={200}
                />
              )}
            </Field>
            <Field id="participant-email" label="Email" error={fields.email}>
              {(control) => (
                <Input
                  {...control}
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </Field>
          </TabsContent>
        </Tabs>
        {error ? <ErrorNotice message={error} /> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Annuler
            </Button>
          </DialogClose>
          <Button
            type="button"
            loading={isPending}
            onClick={submit}
            disabled={mode === "colleague" && colleagues.length === 0}
          >
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
