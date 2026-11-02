"use client";

import { useActionState, useEffect } from "react";

import { ErrorNotice } from "@/components/auth/error-notice";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { updateOwnNameAction } from "@/server/actions/account-actions";
import { initialActionState } from "@/server/actions/state";

/** Lets the user change their own display name. */
export function AccountNameForm({ fullName }: { fullName: string }) {
  const [state, action] = useActionState(updateOwnNameAction, initialActionState);
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok) toast({ variant: "success", title: "Nom enregistré" });
  }, [state.ok, state.tick, toast]);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <ErrorNotice message={state.error} /> : null}
      <Field id="fullName" label="Nom affiché">
        {(control) => (
          <Input
            {...control}
            name="fullName"
            defaultValue={fullName}
            autoComplete="name"
            maxLength={200}
            required
          />
        )}
      </Field>
      <div>
        <SubmitButton variant="secondary">Enregistrer le nom</SubmitButton>
      </div>
    </form>
  );
}
