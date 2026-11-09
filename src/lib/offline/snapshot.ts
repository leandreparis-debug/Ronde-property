import type { ReportOptions } from "@/lib/report/options";
import type { Participant } from "@/server/domain";
import type { UserRole, VisitReason, VisitStatus, VisitType } from "@/server/domain/enums";
import type { ZoneNoteView } from "@/server/domain/zone-notes";
import type { PhotoView } from "@/server/photos/types";
import type { MarkerView, PlanPageView, PlanView } from "@/server/plans/types";
import type { AssignableProfile } from "@/server/repositories/profile-repository";
import type { VisitPermissions } from "@/server/repositories/visit-repository";
import type { ReportView } from "@/server/reports/service";
import type { ReserveDetail } from "@/server/reserves/types";

/** A visit as the device stores and displays it (dates as ISO strings). */
export interface VisitView {
  id: string;
  siteId: string;
  site: { code: string; name: string; city: string | null };
  type: VisitType;
  reason: VisitReason;
  title: string;
  visitDate: string;
  subject: string | null;
  status: VisitStatus;
  writerId: string | null;
  writerName: string | null;
  createdBy: string;
  createdByName: string | null;
  completedAt: string | null;
  completedByName: string | null;
  deletedAt: string | null;
  deletedByName: string | null;
  duplicatedFromId: string | null;
  version: number;
  updatedAt: string;
  updatedByName: string | null;
  permissions: VisitPermissions;
}

/**
 * Everything the visit screens need, read once on the server (`GET /api/sync/visits/[id]` and
 * the visit page) and merged into the local store. Signed URLs expire after 10 minutes: they
 * serve the on-line display and the download of the offline copy, never the cache.
 */
export interface VisitSnapshot {
  /** Server time of the read (ISO 8601). */
  fetchedAt: string;
  user: { id: string; role: UserRole };
  canCreate: boolean;
  visit: VisitView;
  participants: Participant[];
  writers: AssignableProfile[];
  notes: ZoneNoteView[];
  photos: PhotoView[];
  plans: PlanView[];
  /** Pages of every plan offered in the visit, keyed by plan id. */
  planPages: Record<string, PlanPageView[]>;
  /** Signed URL of the original file of each plan (« Télécharger l'original »). */
  planOriginals: Record<string, string | null>;
  markers: MarkerView[];
  markersSnapshotAt: string;
  reserves: ReserveDetail[];
  reports: ReportView[];
  reportOptions: ReportOptions;
}
