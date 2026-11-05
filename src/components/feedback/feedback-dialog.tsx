"use client";

import { usePathname } from "next/navigation";
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
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { FEEDBACK_TEXT_MAX, RATING_LABELS } from "@/lib/feedback/schema";
import { submitFeedbackAction } from "@/server/actions/feedback-actions";
import { initialActionState } from "@/server/actions/state";

/**
 * « Donner mon avis »: a rating from 1 to 5 (required), « Ce qui marche » and « Ce qui bloque »
 * (optional). The page and the screen size are filled in automatically.
 */
export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, action] = useActionState(submitFeedbackAction, initialActionState);
  const [rating, setRating] = useState<number | null>(null);
  const pathname = usePathname();
  const { toast } = useToast();
  const [viewport, setViewport] = useState("");

  useEffect(() => {
    if (open) setViewport(`${window.innerWidth}x${window.innerHeight}`);
  }, [open]);

  useEffect(() => {
    if (state.ok) {
      toast({ variant: "success", title: "Merci pour votre avis" });
      setRating(null);
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to each new result only
  }, [state.tick]);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent data-testid="feedback-dialog">
        <DialogHeader>
          <DialogTitle>Donner mon avis</DialogTitle>
          <DialogDescription>
            Votre retour aide à améliorer RONDE pendant le pilote. Seule la note est obligatoire.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-5">
          <input type="hidden" name="pagePath" value={pathname} />
          <input type="hidden" name="viewport" value={viewport} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-ui font-semibold">
              Votre note <span className="font-normal text-ink-2">(obligatoire)</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-12 min-w-12 cursor-pointer flex-col items-center justify-center rounded-md border px-3 py-1 text-center has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand",
                    rating === value
                      ? "border-brand bg-brand-soft text-brand-deep"
                      : "border-rule bg-paper text-ink hover:bg-craie",
                  )}
                >
                  <input
                    type="radio"
                    name="rating"
                    value={value}
                    checked={rating === value}
                    onChange={() => setRating(value)}
                    className="sr-only"
                    data-testid={`feedback-rating-${value}`}
                  />
                  <span className="text-title-sm font-bold">{value}</span>
                  <span className="text-label text-ink-2">{RATING_LABELS[value]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field id="feedback-works" label="Ce qui marche">
            {(control) => (
              <Textarea {...control} name="works" rows={3} maxLength={FEEDBACK_TEXT_MAX} />
            )}
          </Field>
          <Field id="feedback-blocks" label="Ce qui bloque">
            {(control) => (
              <Textarea {...control} name="blocks" rows={3} maxLength={FEEDBACK_TEXT_MAX} />
            )}
          </Field>
          <p className="text-ui text-ink-2">
            Page concernée : <span className="font-medium text-ink">{pathname}</span>
          </p>
          {state.error ? <ErrorNotice message={state.error} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton disabled={rating === null} data-testid="feedback-submit">
              Envoyer mon avis
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
