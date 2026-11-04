import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { VisitActions } from "@/components/visits/visit-actions";
import { VisitBanner } from "@/components/visits/visit-banner";
import { VisitHeader } from "@/components/visits/visit-header";
import { NotesTab } from "@/components/visits/notes/notes-tab";
import { PhotosTab } from "@/components/visits/photos/photos-tab";
import { PlansTab } from "@/components/visits/plans/plans-tab";
import { UploadQueuePill } from "@/components/visits/photos/upload-queue-pill";
import { UploadQueueProvider } from "@/components/visits/photos/upload-queue-provider";
import { VisitInformationTab } from "@/components/visits/visit-information-tab";
import { VisitTabs } from "@/components/visits/visit-tabs";
import { requireUser } from "@/server/auth/session";
import { isZoneFilled } from "@/lib/notes/format";
import { incompletePoints } from "@/server/domain/visits";
import { toZoneNoteView } from "@/server/domain/zone-notes";
import { listPhotos } from "@/server/services/photos";
import { getPlanDetail, listVisitMarkers, listVisitPlans } from "@/server/services/plans";
import { getVisit, listAssignable, listParticipants } from "@/server/services/visits";
import { listZoneNotes } from "@/server/services/zone-notes";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return { title: "Visite" };
  const visit = await getVisit(id);
  return { title: visit ? visit.title : "Visite" };
}

/** Visit page: header, actions, read-only banner and the six tabs. */
export default async function VisitPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const visit = await getVisit(id);
  if (!visit) notFound();
  const query = await searchParams;
  const planParam =
    typeof query.plan === "string" && z.uuid().safeParse(query.plan).success ? query.plan : null;
  const [participants, writers, notes, photos, plans, markers, planDetail] = await Promise.all([
    listParticipants(id),
    listAssignable(),
    listZoneNotes(id),
    listPhotos(id),
    listVisitPlans(id, visit.siteId),
    listVisitMarkers(id),
    planParam ? getPlanDetail(planParam, id).catch(() => null) : Promise.resolve(null),
  ]);
  const canCreate = user.role === "rt" || user.role === "admin";
  const filledZonesCount = notes.filter((note) => isZoneFilled(note.content)).length;
  const uncaptionedPhotosCount = photos.filter((photo) => !photo.caption).length;
  const readyPhotoIds = new Set(photos.map((photo) => photo.id));
  const markersWithoutPhotoCount = markers.filter(
    (marker) => !marker.photoId || !readyPhotoIds.has(marker.photoId),
  ).length;
  const planNames = new Map(plans.map((plan) => [plan.id, plan.name]));
  const markersByPhoto = Object.fromEntries(
    markers
      .filter((marker) => marker.photoId)
      .map((marker) => [
        marker.photoId!,
        {
          markerId: marker.id,
          number: marker.number,
          planId: marker.planId,
          planName: planNames.get(marker.planId) ?? "Plan",
          page: marker.page,
        },
      ]),
  );
  const points = incompletePoints({
    writerId: visit.writerId,
    subject: visit.subject,
    participantsCount: participants.length,
    filledZonesCount,
    uncaptionedPhotosCount,
    markersWithoutPhotoCount,
  });
  const zones = notes.map((note) => ({ key: note.zoneKey, label: note.zoneLabel }));

  return (
    <UploadQueueProvider visitId={visit.id}>
      <VisitHeader
        visit={visit}
        zones={{ filled: filledZonesCount, total: notes.length }}
        photosCount={photos.length}
        status={<UploadQueuePill />}
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
            photos={photos}
          />
        }
        plans={
          <PlansTab
            key={`plans-${visit.status}-${visit.permissions.canEdit}`}
            visitId={visit.id}
            siteId={visit.siteId}
            initialPlans={plans}
            initialMarkers={markers}
            initialDetail={planDetail}
            photos={photos}
            zones={zones}
            canEdit={visit.permissions.canEdit}
            canImport={canCreate}
          />
        }
        photos={
          <PhotosTab
            key={`${visit.status}-${visit.permissions.canEdit}`}
            visitId={visit.id}
            initialPhotos={photos}
            zones={zones}
            canEdit={visit.permissions.canEdit}
            markersByPhoto={markersByPhoto}
          />
        }
        information={
          <VisitInformationTab
            key={`${visit.status}-${visit.permissions.canEdit}`}
            visit={visit}
            participants={participants}
            writers={writers}
            filledZonesCount={filledZonesCount}
            uncaptionedPhotosCount={uncaptionedPhotosCount}
            markersWithoutPhotoCount={markersWithoutPhotoCount}
          />
        }
      />
    </UploadQueueProvider>
  );
}
