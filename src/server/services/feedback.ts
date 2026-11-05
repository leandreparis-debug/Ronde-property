import "server-only";

import { randomUUID } from "node:crypto";

import type { FeedbackRow } from "@/lib/feedback/csv";
import { type FeedbackFilters, periodStart } from "@/lib/feedback/list";
import { type FeedbackInput, feedbackInputSchema } from "@/lib/feedback/schema";
import { APP_VERSION } from "@/lib/version";
import { requireRoleForAction, requireUserForAction } from "@/server/auth/session";
import { withUser } from "@/server/db/context";
import { USER_ROLE_LABELS } from "@/server/domain/enums";
import { ValidationError } from "@/server/errors";

/** Most rows listed or exported at once (a pilot gives a few hundred at most). */
export const FEEDBACK_LIST_LIMIT = 2000;

/**
 * « Donner mon avis »: any active user records a feedback for themselves (RLS: author =
 * caller, active account). Only the rating is required.
 */
export async function submitFeedback(input: unknown): Promise<{ id: string }> {
  const user = await requireUserForAction();
  const parsed = feedbackInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);
  const data: FeedbackInput = parsed.data;
  // The author cannot read feedback back (admin only): no RETURNING, the id is generated here.
  const id = randomUUID();
  await withUser(user, (trx) =>
    trx
      .insertInto("feedback")
      .values({
        id,
        author_id: user.id,
        rating: data.rating,
        works: data.works,
        blocks: data.blocks,
        page_path: data.pagePath,
        viewport: data.viewport ?? null,
        app_version: APP_VERSION,
      })
      .execute(),
  );
  return { id };
}

/** Summary shown above the list. */
export interface FeedbackSummary {
  count: number;
  /** Mean rating, one decimal; null without feedback. */
  averageRating: number | null;
  /** Number of feedback per rating, from 1 to 5. */
  byRating: Record<1 | 2 | 3 | 4 | 5, number>;
}

/**
 * Admin: feedback matching the filters, newest first (RLS: only the admin reads `feedback`).
 * The author is shown by name and role, never by e-mail.
 */
export async function listFeedback(
  filters: FeedbackFilters,
  now: Date = new Date(),
): Promise<{ rows: FeedbackRow[]; summary: FeedbackSummary }> {
  const admin = await requireRoleForAction(["admin"]);
  const since = periodStart(filters.period, now);
  const rows = await withUser(admin, (trx) => {
    let query = trx
      .selectFrom("feedback as f")
      .innerJoin("profiles as p", "p.id", "f.author_id")
      .select([
        "f.id",
        "f.created_at",
        "f.rating",
        "f.works",
        "f.blocks",
        "f.page_path",
        "f.viewport",
        "f.app_version",
        "p.full_name",
        "p.role",
      ])
      .orderBy("f.created_at", "desc")
      .limit(FEEDBACK_LIST_LIMIT);
    if (filters.maxRating !== null) query = query.where("f.rating", "<=", filters.maxRating);
    if (since) query = query.where("f.created_at", ">=", since);
    if (filters.blocksOnly) query = query.where("f.blocks", "is not", null);
    if (filters.page) query = query.where("f.page_path", "ilike", `%${escapeLike(filters.page)}%`);
    return query.execute();
  });

  const byRating: FeedbackSummary["byRating"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of rows) byRating[row.rating as 1 | 2 | 3 | 4 | 5] += 1;
  const total = rows.reduce((sum, row) => sum + row.rating, 0);
  return {
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      authorName: row.full_name,
      authorRole: USER_ROLE_LABELS[row.role],
      rating: row.rating,
      works: row.works,
      blocks: row.blocks,
      pagePath: row.page_path,
      viewport: row.viewport,
      appVersion: row.app_version,
    })),
    summary: {
      count: rows.length,
      averageRating: rows.length > 0 ? Math.round((total / rows.length) * 10) / 10 : null,
      byRating,
    },
  };
}

/** Escapes the LIKE wildcards of a user-typed fragment. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
