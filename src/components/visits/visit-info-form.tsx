"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOptionalVisit } from "@/components/offline/visit-data";
import { useVisitMutations } from "@/components/offline/visit-mutations";
import { formatDateTime } from "@/lib/format";
import type { VisitView } from "@/lib/offline/snapshot";
import { visitUpdateSchema } from "@/server/domain/schemas";
import { VISIT_TYPES, type VisitReason, type VisitType } from "@/server/domain/enums";
import { VISIT_REASON_LABELS, VISIT_TYPE_LABELS } from "@/server/domain/labels";
import { defaultReasonFor, REASONS_FOR_TYPE } from "@/server/domain/visits";
import type { AssignableProfile } from "@/server/repositories/profile-repository";

import { useVisitVersion } from "./visit-version-context";

export interface VisitInfoFormProps {
  visit: VisitView;
  writers: AssignableProfile[];
}

interface Values {
  type: VisitType;
  reason: VisitReason;
  title: string;
  visitDate: string;
  subject: string;
  writerId: string;
}

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "queued"; deviceOffline: boolean }
  | { kind: "error"; message: string };

const DEBOUNCE_MS = 800;

function toValues(visit: VisitView): Values {
  return {
    type: visit.type,
    reason: visit.reason,
    title: visit.title,
    visitDate: visit.visitDate,
    subject: visit.subject ?? "",
    writerId: visit.writerId ?? "",
  };
}

function toPatch(values: Values) {
  return {
    type: values.type,
    reason: values.reason,
    title: values.title,
    visitDate: values.visitDate,
    subject: values.subject.trim() === "" ? null : values.subject,
    writerId: values.writerId === "" ? null : values.writerId,
  };
}

/** Field messages of a refused patch, keyed by field. */
function fieldMessages(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/**
 * Editable information fields with autosave (800 ms after the last change, or on blur)
 * through the outbox, a discreet status (saved, waiting for the network) and the version
 * conflict handling.
 */
export function VisitInfoForm({ visit, writers }: VisitInfoFormProps) {
  const { conflict, setConflict } = useVisitVersion();
  const mutations = useVisitMutations(visit.id);
  const live = useOptionalVisit();
  const waiting = live?.outbox.some((entry) => entry.kind === "visit.update") ?? false;
  const [values, setValues] = useState<Values>(() => toValues(visit));
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const lastSaved = useRef<string>(JSON.stringify(toPatch(toValues(visit))));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Values | null>(null);
  const inFlight = useRef(false);

  const save = useCallback(
    async (next: Values) => {
      if (conflict) return;
      const patch = toPatch(next);
      const serialized = JSON.stringify(patch);
      if (serialized === lastSaved.current) return;
      if (inFlight.current) {
        pending.current = next;
        return;
      }
      // Same rules as the server (type / reason, lengths), checked before queueing.
      const parsed = visitUpdateSchema.safeParse(patch);
      if (!parsed.success) {
        setFieldErrors(fieldMessages(parsed.error.issues));
        setStatus({ kind: "error", message: "Vérifiez les champs signalés." });
        return;
      }
      inFlight.current = true;
      setStatus({ kind: "saving" });
      const result = await mutations.saveVisit(parsed.data);
      inFlight.current = false;
      if (result.ok) {
        lastSaved.current = serialized;
        setFieldErrors({});
        setStatus(
          result.queued
            ? { kind: "queued", deviceOffline: !navigator.onLine }
            : { kind: "saved", at: String(result.data.savedAt ?? new Date().toISOString()) },
        );
      } else if (result.conflict) {
        setConflict({ message: result.error, entry: result.conflict });
        setStatus({ kind: "idle" });
      } else {
        setStatus({ kind: "error", message: result.error });
      }
      if (pending.current) {
        const queued = pending.current;
        pending.current = null;
        void save(queued);
      }
    },
    [conflict, setConflict, mutations],
  );

  const scheduleSave = useCallback(
    (next: Values) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(next), DEBOUNCE_MS);
    },
    [save],
  );

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    void save(values);
  }, [save, values]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Queued while this page was open, sent later (back online): « Enregistré à ».
  useEffect(() => {
    if (status.kind === "queued" && !waiting && live) {
      setStatus({ kind: "saved", at: live.visit.updatedAt });
    }
  }, [status.kind, waiting, live]);

  function update(patch: Partial<Values>, immediate = false) {
    const next = { ...values, ...patch };
    setValues(next);
    if (immediate) {
      if (timer.current) clearTimeout(timer.current);
      void save(next);
    } else {
      scheduleSave(next);
    }
  }

  function changeType(type: VisitType) {
    const reason = REASONS_FOR_TYPE[type].includes(values.reason)
      ? values.reason
      : defaultReasonFor(type);
    update({ type, reason }, true);
  }

  return (
    <div className="flex flex-col gap-5" aria-busy={status.kind === "saving" || undefined}>
      <p className="text-ui text-ink-2" role="status" aria-live="polite" data-testid="save-status">
        {status.kind === "saving" ? "Enregistrement…" : null}
        {status.kind === "saved" ? `Enregistré à ${formatDateTime(status.at).slice(-5)}` : null}
        {status.kind === "queued"
          ? status.deviceOffline
            ? "Hors connexion : modification gardée sur la tablette, envoi au retour du réseau."
            : "Hors connexion : nouvelle tentative…"
          : null}
        {status.kind === "error" ? `Erreur, réessayer : ${status.message}` : null}
        {status.kind === "idle" ? "Les modifications sont enregistrées automatiquement." : null}
      </p>

      <Field id="visit-title" label="Titre" required error={fieldErrors.title}>
        {(control) => (
          <Input
            {...control}
            value={values.title}
            maxLength={200}
            onChange={(event) => update({ title: event.target.value })}
            onBlur={flush}
            className="h-13 text-body"
          />
        )}
      </Field>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field id="visit-type" label="Type" required>
          {(control) => (
            <Select
              {...control}
              value={values.type}
              onChange={(event) => changeType(event.target.value as VisitType)}
              className="h-13 text-body"
            >
              {VISIT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {VISIT_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="visit-reason" label="Motif" required error={fieldErrors.reason}>
          {(control) => (
            <Select
              {...control}
              value={values.reason}
              onChange={(event) => update({ reason: event.target.value as VisitReason }, true)}
              className="h-13 text-body"
            >
              {REASONS_FOR_TYPE[values.type].map((reason) => (
                <option key={reason} value={reason}>
                  {VISIT_REASON_LABELS[reason]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="visit-date" label="Date" required error={fieldErrors.visitDate}>
          {(control) => (
            <Input
              {...control}
              type="date"
              value={values.visitDate}
              onChange={(event) => update({ visitDate: event.target.value })}
              onBlur={flush}
              className="h-13 text-body"
            />
          )}
        </Field>
        <Field id="visit-writer" label="Rédacteur" error={fieldErrors.writerId}>
          {(control) => (
            <Select
              {...control}
              value={values.writerId}
              onChange={(event) => update({ writerId: event.target.value }, true)}
              className="h-13 text-body"
            >
              <option value="">Aucun pour l&apos;instant</option>
              {writers.map((writer) => (
                <option key={writer.id} value={writer.id}>
                  {writer.fullName}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field
        id="visit-subject"
        label="Objet"
        hint="2 000 caractères maximum."
        error={fieldErrors.subject}
      >
        {(control) => (
          <Textarea
            {...control}
            value={values.subject}
            maxLength={2000}
            rows={4}
            onChange={(event) => update({ subject: event.target.value })}
            onBlur={flush}
          />
        )}
      </Field>
    </div>
  );
}
