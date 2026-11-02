import { Check, Circle } from "lucide-react";

import { PASSWORD_RULES } from "@/server/auth/password-policy";

/** Live checklist of the password rules: icon and text, never colour alone. */
export function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="flex flex-col gap-1 text-ui" aria-label="Règles du mot de passe">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li key={rule.key} className="flex items-center gap-2">
            {met ? (
              <Check className="size-4 text-status-done" aria-hidden="true" />
            ) : (
              <Circle className="size-4 text-ink-2" aria-hidden="true" />
            )}
            <span className={met ? "text-ink" : "text-ink-2"}>
              {rule.label}
              <span className="sr-only">{met ? " : respectée" : " : à faire"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
