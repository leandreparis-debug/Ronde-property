"use client";

import { useActionState } from "react";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signInAction } from "@/server/actions/auth-actions";
import { initialActionState } from "@/server/actions/state";

import { ErrorNotice } from "./error-notice";
import { SubmitButton } from "./submit-button";

/** Email and password form of /connexion. */
export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInAction, initialActionState);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error ? <ErrorNotice message={state.error} /> : null}
      <Field id="email" label="Email">
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            className="h-13 text-body"
          />
        )}
      </Field>
      <Field id="password" label="Mot de passe">
        {(control) => (
          <Input
            {...control}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-13 text-body"
          />
        )}
      </Field>
      <SubmitButton size="lg" className="w-full">
        Se connecter
      </SubmitButton>
    </form>
  );
}
