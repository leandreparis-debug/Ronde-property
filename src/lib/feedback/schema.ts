import { z } from "zod";

/** Longest « Ce qui marche » / « Ce qui bloque » text (same limit as the database). */
export const FEEDBACK_TEXT_MAX = 2000;

const optionalText = z
  .string()
  .max(FEEDBACK_TEXT_MAX, `${FEEDBACK_TEXT_MAX} caractères maximum.`)
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
  });

/** Keeps the path only: no query string nor fragment (they may carry identifiers). */
export function cleanPagePath(value: string): string {
  const path = value.split(/[?#]/)[0] ?? "/";
  return path.startsWith("/") && !path.startsWith("//") ? path.slice(0, 300) : "/";
}

/** « Donner mon avis »: only the rating is required (1 to 5). */
export const feedbackInputSchema = z.object({
  rating: z.coerce
    .number({ message: "Choisissez une note de 1 à 5." })
    .int("Choisissez une note de 1 à 5.")
    .min(1, "Choisissez une note de 1 à 5.")
    .max(5, "Choisissez une note de 1 à 5."),
  works: optionalText,
  blocks: optionalText,
  pagePath: z.string().default("/").transform(cleanPagePath),
  viewport: z
    .string()
    .regex(/^\d{2,5}x\d{2,5}$/)
    .optional()
    .catch(undefined),
});

/** Parsed feedback, ready for the database. */
export type FeedbackInput = z.output<typeof feedbackInputSchema>;

/** Labels of the ratings, from 1 to 5. */
export const RATING_LABELS: Record<number, string> = {
  1: "Très difficile",
  2: "Difficile",
  3: "Correct",
  4: "Bien",
  5: "Très bien",
};
