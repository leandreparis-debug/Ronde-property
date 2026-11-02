import { z } from "zod";

/*
 * Password policy, free of Node-only imports so that the live checklist can run in the
 * browser. The generator and email helpers live in passwords.ts (server).
 */

/** Password policy: 12 characters minimum, at least one letter and one digit. */
export const PASSWORD_MIN_LENGTH = 12;

export interface PasswordRule {
  key: "length" | "letter" | "digit";
  label: string;
  test: (password: string) => boolean;
}

/** Rules displayed live on the change-password screen (text, never colour alone). */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  { key: "length", label: "12 caractères minimum", test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { key: "letter", label: "Au moins une lettre", test: (p) => /\p{L}/u.test(p) },
  { key: "digit", label: "Au moins un chiffre", test: (p) => /\d/.test(p) },
];

/** Zod schema of a new password (policy only; the comparison with the current one is separate). */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, "12 caractères minimum.")
  .max(128, "128 caractères maximum.")
  .refine((p) => /\p{L}/u.test(p), "Au moins une lettre.")
  .refine((p) => /\d/.test(p), "Au moins un chiffre.");

/** True when every rule passes. */
export function satisfiesPasswordPolicy(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}
