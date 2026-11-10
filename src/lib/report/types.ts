import type {
  ReservePriority,
  ReserveStatus,
  VisitReason,
  VisitStatus,
  VisitType,
} from "@/server/domain/enums";

/*
 * Data of a report, read once by the server (`getReportData`, one `withUser` transaction) and
 * frozen: the PDF is laid out from it in the browser without any further query, except the
 * images. **No e-mail address** is part of it: the report is sent to operators and contractors.
 */

/** Signed read URL of an image, with its dimensions (pixels). */
export interface ReportImage {
  /** Stable key used to renew the URL: `photo:{id}` or `page:{planId}:{pageNumber}`. */
  key: string;
  url: string | null;
  width: number | null;
  height: number | null;
}

/** A ready photo of the visit. */
export interface ReportPhotoData {
  id: string;
  zoneKey: string | null;
  caption: string | null;
  category: string;
  isCover: boolean;
  takenAt: string | null;
  sortOrder: number;
  createdAt: string;
  /** 1 600 px image (the browser reduces it to 1 000 px in « Légère »). */
  image: ReportImage;
  /** Markers that link this photo. */
  markerIds: string[];
  /** Reserves this photo illustrates (defect photos). */
  reserveIds: string[];
}

/** A marker of the visit on a plan page. */
export interface ReportMarkerData {
  id: string;
  planId: string;
  page: number;
  /** Relative coordinates, 0 to 1. */
  x: number;
  y: number;
  number: number;
  /** « note »: a note on the plan (step 12 b), its text in `label`. */
  kind: "photo" | "note";
  label: string | null;
  photoId: string | null;
  reserveId: string | null;
}

/** A building of the site, with its outline on the exterior view (relative points). */
export interface ReportBuildingData {
  id: string;
  name: string;
  sortOrder: number;
  outline: Array<{ x: number; y: number }> | null;
  isArchived: boolean;
}

/** A view of the site: the exterior view or a level of a building, i.e. a page of a plan. */
export interface ReportViewData {
  id: string;
  kind: "exterior" | "level";
  buildingId: string | null;
  label: string;
  sortOrder: number;
  planId: string;
  pageNumber: number;
  replacedBy: string | null;
  isArchived: boolean;
}

/** A plan used by the visit (at least one marker), with the pages that carry markers. */
export interface ReportPlanData {
  id: string;
  name: string;
  isArchived: boolean;
  pages: Array<{ pageNumber: number; image: ReportImage }>;
  markers: ReportMarkerData[];
}

/** A reserve of the visit (not deleted). Responsible: name and company only. */
export interface ReportReserveData {
  id: string;
  number: number;
  code: string;
  action: string;
  description: string | null;
  zoneKey: string | null;
  priority: ReservePriority;
  status: ReserveStatus;
  dueDate: string | null;
  isOverdue: boolean;
  daysOverdue: number;
  responsibleKind: "internal" | "external" | null;
  responsibleName: string | null;
  responsibleCompany: string | null;
  closedAt: string | null;
  closedByName: string | null;
  photoIds: string[];
  markerId: string | null;
}

/** Everything a report shows, frozen at the start of the generation. */
export interface ReportData {
  visit: {
    id: string;
    title: string;
    type: VisitType;
    reason: VisitReason;
    status: VisitStatus;
    visitDate: string;
    subject: string | null;
    completedAt: string | null;
    writerName: string | null;
    coverPhotoId: string | null;
    site: {
      code: string;
      name: string;
      address: string | null;
      postalCode: string | null;
      city: string | null;
    };
  };
  participants: Array<{
    fullName: string;
    company: string | null;
    jobTitle: string | null;
    isPresent: boolean;
  }>;
  /** Zones in the order of the visit (trame), with their raw content. */
  zones: Array<{ key: string; label: string; content: string }>;
  photos: ReportPhotoData[];
  plans: ReportPlanData[];
  /** Buildings and views of the site: order and titles of the plans section. */
  buildings: ReportBuildingData[];
  views: ReportViewData[];
  reserves: ReportReserveData[];
  /** The report being generated: its number in the visit and its author. */
  report: { id: string | null; number: number; generatedByName: string; isDraft: boolean };
  /** When the signed image URLs expire (ISO 8601). */
  urlsExpireAt: string;
}
