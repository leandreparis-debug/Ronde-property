import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Participant } from "@/server/domain";
import { incompletePoints } from "@/server/domain/visits";
import type { AssignableProfile } from "@/server/repositories/profile-repository";
import type { VisitView } from "@/lib/offline/snapshot";

import { ConflictNotice } from "./conflict-notice";
import { IncompletePoints } from "./incomplete-points";
import { ParticipantsPanel } from "./participants-panel";
import { VisitInfoForm } from "./visit-info-form";
import { VisitInfoReadonly } from "./visit-info-readonly";
import { VisitVersionProvider } from "./visit-version-context";

export interface VisitInformationTabProps {
  visit: VisitView;
  participants: Participant[];
  /** Entities with an operation waiting (« en attente » marks). */
  pendingIds?: Set<string>;
  writers: AssignableProfile[];
  /** Zones with a non-blank note (« Aucune observation saisie » when zero). */
  filledZonesCount: number;
  /** Ready photos without a caption (« N photos sans légende »). */
  uncaptionedPhotosCount: number;
  /** Plan markers without a photo (« N repères sans photo »). */
  markersWithoutPhotoCount: number;
  /** Reserves not done without responsible, without due date, urgent without photo. */
  reserveCounts?: {
    withoutResponsible: number;
    withoutDueDate: number;
    urgentWithoutPhoto: number;
  };
}

/** « Informations » tab: visit block, site (read-only), participants and incomplete points. */
export function VisitInformationTab({
  visit,
  participants,
  pendingIds,
  writers,
  filledZonesCount,
  uncaptionedPhotosCount,
  markersWithoutPhotoCount,
  reserveCounts,
}: VisitInformationTabProps) {
  const canEdit = visit.permissions.canEdit;
  const points = incompletePoints({
    writerId: visit.writerId,
    subject: visit.subject,
    participantsCount: participants.length,
    filledZonesCount,
    uncaptionedPhotosCount,
    markersWithoutPhotoCount,
    reserves: reserveCounts,
  });

  return (
    <VisitVersionProvider>
      <div className="flex flex-col gap-6">
        <ConflictNotice />
        <IncompletePoints points={points} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
          <Card>
            <CardHeader>
              <CardTitle>Visite</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {canEdit ? (
                <VisitInfoForm visit={visit} writers={writers} />
              ) : (
                <VisitInfoReadonly visit={visit} />
              )}
              <div className="rounded-md bg-craie p-3 text-ui">
                <p className="label-caps text-ink-2">Site</p>
                <p className="font-semibold text-ink">
                  {visit.site.code} · {visit.site.name}
                  {visit.site.city ? ` · ${visit.site.city}` : ""}
                </p>
                <p className="text-ink-2">Le site ne peut pas être changé après la création.</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <ParticipantsPanel
                visitId={visit.id}
                participants={participants}
                pendingIds={pendingIds}
                colleagues={writers}
                canEdit={canEdit}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </VisitVersionProvider>
  );
}
