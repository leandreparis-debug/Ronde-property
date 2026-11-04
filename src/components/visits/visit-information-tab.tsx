import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Participant } from "@/server/domain";
import { incompletePoints } from "@/server/domain/visits";
import type { AssignableProfile } from "@/server/repositories/profile-repository";
import type { VisitDetail } from "@/server/repositories/visit-repository";

import { ConflictNotice } from "./conflict-notice";
import { IncompletePoints } from "./incomplete-points";
import { ParticipantsPanel } from "./participants-panel";
import { VisitInfoForm } from "./visit-info-form";
import { VisitInfoReadonly } from "./visit-info-readonly";
import { VisitVersionProvider } from "./visit-version-context";

export interface VisitInformationTabProps {
  visit: VisitDetail;
  participants: Participant[];
  writers: AssignableProfile[];
  /** Zones with a non-blank note (« Aucune observation saisie » when zero). */
  filledZonesCount: number;
  /** Ready photos without a caption (« N photos sans légende »). */
  uncaptionedPhotosCount: number;
  /** Plan markers without a photo (« N repères sans photo »). */
  markersWithoutPhotoCount: number;
}

/** « Informations » tab: visit block, site (read-only), participants and incomplete points. */
export function VisitInformationTab({
  visit,
  participants,
  writers,
  filledZonesCount,
  uncaptionedPhotosCount,
  markersWithoutPhotoCount,
}: VisitInformationTabProps) {
  const canEdit = visit.permissions.canEdit;
  const points = incompletePoints({
    writerId: visit.writerId,
    subject: visit.subject,
    participantsCount: participants.length,
    filledZonesCount,
    uncaptionedPhotosCount,
    markersWithoutPhotoCount,
  });

  return (
    <VisitVersionProvider initialVersion={visit.version}>
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
                initial={participants}
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
