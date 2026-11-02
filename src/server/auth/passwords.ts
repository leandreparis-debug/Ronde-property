import { createHash } from "node:crypto";

import { z } from "zod";

/** Alphabet of temporary passwords: no 0/O, 1/l/I or other ambiguous characters. */
export const TEMPORARY_PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export const TEMPORARY_PASSWORD_LENGTH = 16;

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

function randomIndexes(count: number, modulus: number): number[] {
  // Rejection sampling keeps the distribution uniform over the alphabet.
  const limit = 256 - (256 % modulus);
  const result: number[] = [];
  const buffer = new Uint8Array(count * 2);
  while (result.length < count) {
    crypto.getRandomValues(buffer);
    for (const byte of buffer) {
      if (byte < limit) {
        result.push(byte % modulus);
        if (result.length === count) break;
      }
    }
  }
  return result;
}

/**
 * Generates a 16-character temporary password with `crypto.getRandomValues`, without
 * ambiguous characters, that satisfies the policy (at least one letter and one digit).
 * About 92 bits of entropy. Shown once to the admin, never logged nor stored in clear.
 */
export function generateTemporaryPassword(): string {
  const alphabet = TEMPORARY_PASSWORD_ALPHABET;
  for (;;) {
    const password = randomIndexes(TEMPORARY_PASSWORD_LENGTH, alphabet.length)
      .map((index) => alphabet[index] ?? "")
      .join("");
    if (satisfiesPasswordPolicy(password)) return password;
  }
}

/** Normalises an email for comparison and storage: trimmed, lowercase. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Short, non-reversible identifier of an email for the audit log (never the clear email). */
export function hashEmail(email: string): string {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 16);
}
