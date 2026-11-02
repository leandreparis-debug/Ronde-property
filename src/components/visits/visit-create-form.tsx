"use client";

import { CalendarDays, Users, Wrench } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { ErrorNotice } from "@/components/auth/error-notice";
import { SubmitButton } from "@/components/auth/submit-button";
import { SitePicker } from "@/components/sites/site-picker";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { todayInParis } from "@/lib/format";
import { searchSitesAction, type SiteOption } from "@/server/actions/site-actions";
import { initialActionState } from "@/server/actions/state";
import { createVisitAction } from "@/server/actions/visit-actions";
import { VISIT_TYPES, type VisitReason, type VisitType } from "@/server/domain/enums";
import { VISIT_REASON_LABELS, VISIT_TYPE_LABELS } from "@/server/domain/labels";
import {
  defaultReasonFor,
  REASONS_FOR_TYPE,
  suggestVisitTitle,
  visitDateWarning,
} from "@/server/domain/visits";
import type { AssignableProfile } from "@/server/repositories/profile-repository";

export interface VisitCreateFormProps {
  presetSite: SiteOption | null;
  /** Message when `?site=` pointed to an inactive or unknown site. */
  presetError?: string;
  writers: AssignableProfile[];
  currentUserId: string;
}

const TYPE_ICONS = { technical: Wrench, meeting: Users } as const;

/** Creation form: type cards, reason adapted to the type, SitePicker, date, suggested title, writer. */
export function VisitCreateForm({
  presetSite,
  presetError,
  writers,
  currentUserId,
}: VisitCreateFormProps) {
  const [state, action] = useActionState(createVisitAction, initialActionState);
  const [type, setType] = useState<VisitType>("technical");
  const [reason, setReason] = useState<VisitReason>("periodic");
  const [site, setSite] = useState<SiteOption | null>(presetSite);
  const [title, setTitle] = useState(
    presetSite ? suggestVisitTitle("periodic", presetSite.name) : "",
  );
  const [titleTouched, setTitleTouched] = useState(false);
  const today = todayInParis();
  const [visitDate, setVisitDate] = useState(today);

  function applyType(next: VisitType) {
    setType(next);
    const nextReason = REASONS_FOR_TYPE[next].includes(reason) ? reason : defaultReasonFor(next);
    setReason(nextReason);
    if (!titleTouched) setTitle(suggestVisitTitle(nextReason, site?.name));
  }

  function applyReason(next: VisitReason) {
    setReason(next);
    if (!titleTouched) setTitle(suggestVisitTitle(next, site?.name));
  }

  function applySite(next: SiteOption | null) {
    setSite(next);
    if (!titleTouched) setTitle(next ? suggestVisitTitle(reason, next.name) : "");
  }

  const dateWarning = visitDateWarning(visitDate, today);
  const fields = state.fields ?? {};

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {state.error && !state.fields ? <ErrorNotice message={state.error} /> : null}
      {presetError ? <ErrorNotice message={presetError} /> : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-ui font-semibold text-ink">Type</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {VISIT_TYPES.map((item) => {
            const Icon = TYPE_ICONS[item];
            const selected = type === item;
            return (
              <label
                key={item}
                className={cn(
                  "flex min-h-touch-lg cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-3 text-body font-semibold",
                  selected
                    ? "border-brand bg-brand-soft text-brand-deep"
                    : "border-rule bg-paper text-ink hover:border-brand",
                )}
              >
                <input
                  type="radio"
                  name="type"
                  value={item}
                  checked={selected}
                  onChange={() => applyType(item)}
                  className="size-5 accent-brand"
                />
                <Icon className="size-6" aria-hidden="true" />
                {VISIT_TYPE_LABELS[item]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <Field id="reason" label="Motif" required error={fields.reason}>
        {(control) => (
          <Select
            {...control}
            name="reason"
            value={reason}
            onChange={(event) => applyReason(event.target.value as VisitReason)}
            className="h-13 text-body"
          >
            {REASONS_FOR_TYPE[type].map((item) => (
              <option key={item} value={item}>
                {VISIT_REASON_LABELS[item]}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="flex flex-col gap-1.5">
        <SitePicker
          name="siteId"
          label="Site"
          required
          search={searchSitesAction}
          value={site}
          onChange={applySite}
          error={fields.siteId}
        />
      </div>

      <Field
        id="visitDate"
        label="Date"
        required
        error={fields.visitDate}
        hint={dateWarning ?? undefined}
      >
        {(control) => (
          <div className="relative">
            <CalendarDays
              className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-2"
              aria-hidden="true"
            />
            <Input
              {...control}
              name="visitDate"
              type="date"
              value={visitDate}
              onChange={(event) => setVisitDate(event.target.value)}
              required
              className="h-13 pl-11 text-body"
            />
          </div>
        )}
      </Field>

      <Field
        id="title"
        label="Titre"
        required
        error={fields.title}
        hint="Proposé à partir du motif et du site, modifiable."
      >
        {(control) => (
          <Input
            {...control}
            name="title"
            value={title}
            maxLength={200}
            required
            onChange={(event) => {
              setTitleTouched(true);
              setTitle(event.target.value);
            }}
            className="h-13 text-body"
          />
        )}
      </Field>

      <Field id="writerId" label="Rédacteur" error={fields.writerId}>
        {(control) => (
          <Select
            {...control}
            name="writerId"
            defaultValue={currentUserId}
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

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button asChild variant="secondary" size="lg">
          <Link href="/">Annuler</Link>
        </Button>
        <SubmitButton size="lg">Créer la visite</SubmitButton>
      </div>
    </form>
  );
}
