import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { VisitWorkspace } from "@/components/visits/visit-workspace";
import { requireUser } from "@/server/auth/session";
import { getVisitSnapshot } from "@/server/services/sync";
import { getVisit } from "@/server/services/visits";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return { title: "Visite" };
  const visit = await getVisit(id);
  return { title: visit ? visit.title : "Visite" };
}

/**
 * Visit page: one server read (the whole visit, under RLS, with signed URLs), merged into the
 * local store of the device; the screen then renders from the store (step 12, local first).
 */
export default async function VisitPage({ params }: { params: Params }) {
  await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const snapshot = await getVisitSnapshot(id);
  if (!snapshot) notFound();
  return <VisitWorkspace visitId={id} snapshot={snapshot} />;
}
