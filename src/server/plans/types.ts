/** Formats accepted for the original file of a plan. */
export type PlanMimeType = "application/pdf" | "image/png" | "image/jpeg";
/** Formats of the page images produced by the browser. */
export type PageImageMime = "image/png" | "image/jpeg";

/** A plan row as read from the database. */
export interface PlanRecord {
  id: string;
  siteId: string;
  name: string;
  storagePath: string;
  mimeType: PlanMimeType;
  pageCount: number;
  isArchived: boolean;
  uploadStatus: "pending" | "ready";
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A page of a plan as read from the database. */
export interface PlanPageRecord {
  id: string;
  planId: string;
  pageNumber: number;
  imagePath: string;
  thumbPath: string;
  imageMime: PageImageMime;
  width: number;
  height: number;
  sizeBytes: number;
}

/** A marker as read from the database, with the thumbnail path of its photo. */
export interface MarkerRecord {
  id: string;
  visitId: string;
  planId: string;
  page: number;
  x: number;
  y: number;
  number: number;
  label: string | null;
  photoId: string | null;
  /** Thumbnail path of the linked photo (ready photos only). */
  photoThumbPath: string | null;
  photoCaption: string | null;
  /** Reserve placed by this marker (step 9), `null` for a plain marker. */
  reserve: MarkerReserveRef | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Reserve shown by a marker: code (R-07), status and delay decide its look. */
export interface MarkerReserveRef {
  id: string;
  code: string;
  action: string;
  status: "open" | "in_progress" | "done";
  isOverdue: boolean;
}

/** Signed `PUT` target of one object. */
export interface UploadTargetView {
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

/** Metadata of the original file, declared by the browser before any upload. */
export interface PreparePlanInput {
  name: string;
  mimeType: PlanMimeType;
  sizeBytes: number;
  pageCount: number;
}

/** Metadata of one converted page, declared by the browser. */
export interface PreparePageInput {
  pageNumber: number;
  imageMime: PageImageMime;
  width: number;
  height: number;
  sizeBytes: number;
  thumbSizeBytes: number;
}

/** Answer of the plan preparation: the pending row and the upload target of the original. */
export interface PreparedPlanUpload {
  planId: string;
  original: UploadTargetView;
}

/** Answer of the page preparation: one upload target pair per page. */
export interface PreparedPageUpload {
  pageNumber: number;
  image: UploadTargetView;
  thumb: UploadTargetView;
}

/** Serialisable plan for the interface, with the signed URLs of its first-page thumbnail. */
export interface PlanView {
  id: string;
  siteId: string;
  name: string;
  mimeType: PlanMimeType;
  pageCount: number;
  isArchived: boolean;
  uploadedByName: string | null;
  createdAt: string;
  /** Signed URL of the first page thumbnail, `null` when missing. */
  thumbUrl: string | null;
  /** Markers of the current visit on this plan (when listed for a visit). */
  markersCount: number;
}

/** A page with its signed URLs (10 minutes). */
export interface PlanPageView {
  pageNumber: number;
  width: number;
  height: number;
  imageMime: PageImageMime;
  imageUrl: string | null;
  thumbUrl: string | null;
  urlsExpireAt: string;
}

/** A plan opened in the viewer: pages with URLs and the original download URL. */
export interface PlanDetailView extends PlanView {
  pages: PlanPageView[];
  originalUrl: string | null;
}

/** Serialisable marker for the interface. */
export interface MarkerView {
  id: string;
  visitId: string;
  planId: string;
  page: number;
  x: number;
  y: number;
  number: number;
  label: string | null;
  photoId: string | null;
  photoThumbUrl: string | null;
  photoCaption: string | null;
  /** Reserve placed by this marker: drawn as a reserve marker, opens the reserve. */
  reserve: MarkerReserveRef | null;
  createdAt: string;
  /** Last change, used to merge server and local lists (the latest wins). */
  updatedAt: string;
}

/** Outcome of the plan confirmation. */
export type ConfirmPlanResult =
  { ok: true; plan: PlanView } | { ok: false; error: string; retryable: boolean };

/** Marker linked to a photo, shown in the photo grid (« R3 ») and the photo viewer. */
export interface PhotoMarkerLink {
  markerId: string;
  number: number;
  planId: string;
  planName: string;
  page: number;
}
