import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { VisitActions } from "@/components/visits/visit-actions";
import { VisitBanner } from "@/components/visits/visit-banner";
import { VisitHeader } from "@/components/visits/visit-header";
import { VisitInformationTab } from "@/components/visits/visit-information-tab";
import { VisitTabs } from "@/components/visits/visit-tabs";
import { requireUser } from "@/server/auth/session";
import { incompletePoints } from "@/server/domain/visits";
import { getVisit, listAssignable, listParticipants } from "@/server/services/visits";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return { title: "Visite" };
  const visit = await getVisit(id);
  return { title: visit ? visit.title : "Visite" };
}

/** Visit page: header, actions, read-only banner and the six tabs. */
export default async function VisitPage({ params }: { params: Params }) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const visit = await getVisit(id);
  if (!visit) notFound();
  const [participants, writers] = await Promise.all([listParticipants(id), listAssignable()]);
  const canCreate = user.role === "rt" || user.role === "admin";
  const points = incompletePoints({
    writerId: visit.writerId,
    subject: visit.subject,
    participantsCount: participants.length,
  });

  return (
    <>
      <VisitHeader
        visit={visit}
        actions={<VisitActions visit={visit} canCreate={canCreate} incomplete={points} />}
      />
      <VisitBanner visit={visit} user={user} />
      <Suspense fallback={null}>
        <VisitTabs
          information={
            <VisitInformationTab
              key={`${visit.status}-${visit.permissions.canEdit}`}
              visit={visit}
              participants={participants}
              writers={writers}
            />
          }
        />
      </Suspense>
    </>
  );
}
