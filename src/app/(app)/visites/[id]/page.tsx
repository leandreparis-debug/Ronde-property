import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { VisitActions } from "@/components/visits/visit-actions";
import { VisitBanner } from "@/components/visits/visit-banner";
import { VisitHeader } from "@/components/visits/visit-header";
import { NotesTab } from "@/components/visits/notes/notes-tab";
import { VisitInformationTab } from "@/components/visits/visit-information-tab";
import { VisitTabs } from "@/components/visits/visit-tabs";
import { requireUser } from "@/server/auth/session";
import { isZoneFilled } from "@/lib/notes/format";
import { incompletePoints } from "@/server/domain/visits";
import { toZoneNoteView } from "@/server/domain/zone-notes";
import { getVisit, listAssignable, listParticipants } from "@/server/services/visits";
import { listZoneNotes } from "@/server/services/zone-notes";

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
  const [participants, writers, notes] = await Promise.all([
    listParticipants(id),
    listAssignable(),
    listZoneNotes(id),
  ]);
  const canCreate = user.role === "rt" || user.role === "admin";
  const filledZonesCount = notes.filter((note) => isZoneFilled(note.content)).length;
  const points = incompletePoints({
    writerId: visit.writerId,
    subject: visit.subject,
    participantsCount: participants.length,
    filledZonesCount,
  });

  return (
    <>
      <VisitHeader
        visit={visit}
        zones={{ filled: filledZonesCount, total: notes.length }}
        actions={<VisitActions visit={visit} canCreate={canCreate} incomplete={points} />}
      />
      <VisitBanner visit={visit} user={user} />
      {/* No Suspense boundary here: the page is dynamic, and a boundary this large would be
          streamed as a late segment, which leaves a hidden server copy of the form behind
          while the client renders its own. */}
      <VisitTabs
        notes={
          <NotesTab
            key={`${visit.status}-${visit.permissions.canEdit}`}
            visitId={visit.id}
            visitType={visit.type}
            initialVersion={visit.version}
            initialNotes={notes.map(toZoneNoteView)}
            canEdit={visit.permissions.canEdit}
            userId={user.id}
          />
        }
        information={
          <VisitInformationTab
            key={`${visit.status}-${visit.permissions.canEdit}`}
            visit={visit}
            participants={participants}
            writers={writers}
            filledZonesCount={filledZonesCount}
          />
        }
      />
    </>
  );
}
