"use client";

import { useActionState, useEffect, useState } from "react";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { changePasswordAction } from "@/server/actions/auth-actions";
import { initialActionState } from "@/server/actions/state";

import { ErrorNotice } from "./error-notice";
import { PasswordRules } from "./password-rules";
import { SubmitButton } from "./submit-button";

/**
 * Current, new and confirmed password. In `required` mode the action redirects home with a
 * toast; in `voluntary` mode (account page) the toast is shown here.
 */
export function ChangePasswordForm({ mode }: { mode: "required" | "voluntary" }) {
  const [state, action] = useActionState(changePasswordAction, initialActionState);
  const [password, setPassword] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok && mode === "voluntary") {
      toast({ variant: "success", title: "Mot de passe modifié" });
      setPassword("");
    }
  }, [state.ok, state.tick, mode, toast]);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="mode" value={mode} />
      {state.error ? <ErrorNotice message={state.error} /> : null}
      <Field
        id="currentPassword"
        label={mode === "required" ? "Mot de passe provisoire" : "Mot de passe actuel"}
      >
        {(control) => (
          <Input
            {...control}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        )}
      </Field>
      <Field id="newPassword" label="Nouveau mot de passe" error={state.fields?.newPassword}>
        {(control) => (
          <Input
            {...control}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </Field>
      <PasswordRules password={password} />
      <Field id="confirmPassword" label="Confirmation" error={state.fields?.confirmPassword}>
        {(control) => (
          <Input
            {...control}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        )}
      </Field>
      <SubmitButton size="lg" className="w-full sm:w-auto">
        Enregistrer le nouveau mot de passe
      </SubmitButton>
    </form>
  );
}
