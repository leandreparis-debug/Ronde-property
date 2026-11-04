import type {
  ReserveEventType,
  ReservePriority,
  ReserveStatus,
  ResponsibleKind,
  VisitStatus,
} from "@/server/domain/enums";

/** Marker placing a reserve on a plan. */
export interface ReserveMarkerRef {
  id: string;
  planId: string;
  page: number;
}

/**
 * A reserve as shown in lists (Reserves tab, site page, Notes, plan). The e-mail of an
 * external responsible is **never** part of it: it only appears in {@link ReserveDetail}.
 */
export interface ReserveListItem {
  id: string;
  visitId: string;
  siteId: string;
  number: number;
  /** « R-07 ». */
  code: string;
  action: string;
  zoneKey: string | null;
  zoneLabel: string | null;
  priority: ReservePriority;
  responsibleKind: ResponsibleKind | null;
  /** Internal: full name; external: « Nom · Entreprise »; `null` for « À désigner ». */
  responsibleLabel: string | null;
  /** The internal responsible is a deactivated account (« (inactif) »). */
  responsibleInactive: boolean;
  dueDate: string | null;
  status: ReserveStatus;
  isOverdue: boolean;
  daysOverdue: number;
  closedAt: string | null;
  closedByName: string | null;
  photosCount: number;
  /** Signed URL (10 minutes) of the first defect photo thumbnail. */
  firstThumbUrl: string | null;
  marker: ReserveMarkerRef | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Defect photo of a reserve, with signed URLs. */
export interface ReservePhotoView {
  id: string;
  caption: string | null;
  zoneLabel: string | null;
  thumbUrl: string | null;
  url: string | null;
}

/** A reserve opened on its detail page or in the sheet (edit mode). */
export interface ReserveDetail extends ReserveListItem {
  description: string | null;
  responsibleProfileId: string | null;
  responsibleName: string | null;
  responsibleCompany: string | null;
  /** Detail only: never in lists, URLs or logs. */
  responsibleEmail: string | null;
  createdByName: string | null;
  visitTitle: string;
  visitStatus: VisitStatus;
  photos: ReservePhotoView[];
  /** Plan name of the marker, for the link « Voir sur le plan ». */
  markerPlanName: string | null;
}

/** A field change in the history (`old` → `new`), already formatted for display. */
export interface ReserveChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

/** One entry of the history of a reserve (`reserve_events`, append-only). */
export interface ReserveHistoryEntry {
  id: string;
  type: ReserveEventType;
  fromStatus: ReserveStatus | null;
  toStatus: ReserveStatus | null;
  changes: ReserveChange[];
  actorName: string | null;
  createdAt: string;
}

/** Open reserve of a site, with its original visit (site page). */
export interface SiteReserveItem extends ReserveListItem {
  visitTitle: string;
  visitDate: string;
}

/** Open reserves of a site: counters and the most urgent ones. */
export interface SiteReservesSummary {
  open: number;
  overdue: number;
  urgent: number;
  items: SiteReserveItem[];
}

/** Choices offered for the responsible in the sheet. */
export interface ResponsibleSuggestions {
  /** Active profiles (no e-mail). */
  internal: { id: string; fullName: string }[];
  /** (company, name) pairs already used on the site, most recent first, at most 10. */
  external: { company: string | null; name: string }[];
}

/** Counters of the incomplete points of a visit related to reserves (not done). */
export interface ReserveIncompleteCounts {
  withoutResponsible: number;
  withoutDueDate: number;
  urgentWithoutPhoto: number;
}

/** Reserves linked to a photo, for the photo viewer and grid. */
export interface PhotoReserveLink {
  reserveId: string;
  code: string;
}

/** Outcome of an optimistic update: the saved reserve or the current one in a conflict. */
export type ReserveSaveResult =
  | { ok: true; reserve: ReserveDetail }
  | { ok: false; conflict: true; current: ReserveDetail; message: string };
