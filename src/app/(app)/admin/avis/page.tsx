import type { Metadata } from "next";

import { FeedbackList } from "@/components/admin/feedback-list";
import { parseFeedbackFilters } from "@/lib/feedback/list";
import { requireRole } from "@/server/auth/session";
import { listFeedback } from "@/server/services/feedback";

export const metadata: Metadata = {
  title: "Avis du pilote",
};

/** Admin: feedback given with « Donner mon avis », with filters and a CSV export. */
export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["admin"]);
  const filters = parseFeedbackFilters(await searchParams);
  const { rows, summary } = await listFeedback(filters);
  return (
    <>
      <h2 className="sr-only">Avis du pilote</h2>
      <FeedbackList rows={rows} summary={summary} filters={filters} />
    </>
  );
}
