import "server-only";

import {
  readReportOptions,
  type ReportOptions,
  summariseReportOptions,
} from "@/lib/report/options";
import type { ReportData } from "@/lib/report/types";
import type { UserRef } from "@/server/db/context";
import { NotFoundError, ValidationError } from "@/server/errors";
import { log } from "@/server/log";
import {
  READ_URL_TTL_SECONDS,
  type StorageService,
  UPLOAD_URL_TTL_SECONDS,
} from "@/server/storage/types";

import {
  createReportRepository,
  purgeStalePendingReportRows,
  type ReportRawData,
  type ReportRecord,
  type ReportRepository,
} from "./repository";

/** Bucket of the reports (scheduled purge). */
export const REPORTS_BUCKET = "reports";
const PHOTOS_BUCKET = "visit-photos";
const PLANS_BUCKET = "site-plans";
/** Size limit of the `reports` bucket. */
export const REPORT_MAX_BYTES = 50 * 1024 * 1024;
export const REPORT_TOO_LARGE_MESSAGE =
  "Ce rapport dépasse 50 Mo : il reste téléchargé sur votre appareil mais ne peut pas être enregistré. Régénérez-le en qualité « Légère ».";
const MISSING_FILE_MESSAGE = "Fichier manquant : l'envoi du rapport n'a pas abouti.";
const SIZE_MISMATCH_MESSAGE = "Fichier incomplet : l'envoi du rapport n'a pas abouti.";
const PURGE_MIN_INTERVAL_MS = 60_000;
let lastPurgeAt = 0;

/** A ready report in the history of a visit. */
export interface ReportView {
  id: string;
  number: number;
  fileName: string;
  isDraft: boolean;
  sizeBytes: number | null;
  pageCount: number | null;
  generatedByName: string | null;
  generatedAt: string;
  optionsSummary: string;
}

/** A started generation: the reserved report and its frozen data. */
export interface StartedReport {
  reportId: string;
  number: number;
  fileName: string;
  data: ReportData;
}

/** Upload target of a report. */
export interface ReportUploadTarget {
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

/** Outcome of the confirmation. */
export type ConfirmReportResult =
  { ok: true; report: ReportView } | { ok: false; error: string; retryable: boolean };

function toView(record: ReportRecord): ReportView {
  return {
    id: record.id,
    number: record.number,
    fileName: record.fileName,
    isDraft: record.isDraft,
    sizeBytes: record.sizeBytes,
    pageCount: record.pageCount,
    generatedByName: record.generatedByName,
    generatedAt: record.generatedAt.toISOString(),
    optionsSummary: summariseReportOptions(readReportOptions(record.options)),
  };
}

/**
 * Report use cases for one verified user. The repository enforces the rights through RLS;
 * images and report files are signed only for rows it returned.
 */
export interface ReportService {
  /** Frozen data of the visit (`report.number` is the next number, nothing reserved). */
  getData(visitId: string): Promise<ReportData>;
  /** Reserves a pending report (number, file name) and returns its frozen data. */
  start(visitId: string, options: ReportOptions): Promise<StartedReport>;
  /** Signed PUT of the PDF for the caller's pending report (50 MB at most). */
  uploadTarget(reportId: string, sizeBytes: number): Promise<ReportUploadTarget>;
  /** Checks the object (presence, size, type) and marks the report ready. */
  confirm(reportId: string, sizeBytes: number, pageCount: number): Promise<ConfirmReportResult>;
  list(visitId: string): Promise<ReportView[]>;
  /** Options of the last report of the visit, or the defaults. */
  lastOptions(visitId: string): Promise<ReportOptions>;
  /** Signed read URL (10 minutes) of a ready report, saved under its file name. */
  downloadUrl(reportId: string): Promise<{ url: string; visitId: string }>;
  /** Fresh signed URLs of images of the visit, keyed like `ReportImage.key`. */
  renewImageUrls(visitId: string, keys: string[]): Promise<Record<string, string>>;
}

/** Purges stale pending reports, at most once a minute per process (rows then objects). */
export async function purgeStalePendingReports(
  storage: StorageService,
  options: { force?: boolean } = {},
): Promise<number> {
  const now = Date.now();
  if (!options.force && now - lastPurgeAt < PURGE_MIN_INTERVAL_MS) return 0;
  lastPurgeAt = now;
  try {
    const paths = await purgeStalePendingReportRows();
    if (paths.length > 0) {
      await storage.remove(REPORTS_BUCKET, paths).catch((error: unknown) => {
        log.error("reports.remove_objects_failed", {
          count: paths.length,
          message: error instanceof Error ? error.message : String(error),
        });
      });
      log.info("reports.purged", { count: paths.length });
    }
    return paths.length;
  } catch (error) {
    log.error("reports.purge_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/** Creates the service for a verified user and a storage backend. */
export function createReportService(
  user: UserRef,
  storage: StorageService,
  repository: ReportRepository = createReportRepository(user),
): ReportService {
  async function toData(raw: ReportRawData, report: ReportData["report"]): Promise<ReportData> {
    const photoPaths = raw.photos.map((photo) => photo.storagePath);
    const pagePaths = raw.plans.flatMap((plan) => plan.pages.map((page) => page.imagePath));
    const [photoUrls, pageUrls] = await Promise.all([
      photoPaths.length > 0
        ? storage.createSignedReads(PHOTOS_BUCKET, photoPaths, READ_URL_TTL_SECONDS)
        : Promise.resolve({} as Record<string, string>),
      pagePaths.length > 0
        ? storage.createSignedReads(PLANS_BUCKET, pagePaths, READ_URL_TTL_SECONDS)
        : Promise.resolve({} as Record<string, string>),
    ]);
    const markersByPhoto = new Map<string, string[]>();
    for (const marker of raw.markers) {
      if (marker.photoId) {
        markersByPhoto.set(marker.photoId, [
          ...(markersByPhoto.get(marker.photoId) ?? []),
          marker.id,
        ]);
      }
    }
    const reservesByPhoto = new Map<string, string[]>();
    const photosByReserve = new Map<string, string[]>();
    const readyPhotos = new Set(raw.photos.map((photo) => photo.id));
    for (const link of raw.reservePhotos) {
      if (!readyPhotos.has(link.photoId)) continue;
      reservesByPhoto.set(link.photoId, [
        ...(reservesByPhoto.get(link.photoId) ?? []),
        link.reserveId,
      ]);
      photosByReserve.set(link.reserveId, [
        ...(photosByReserve.get(link.reserveId) ?? []),
        link.photoId,
      ]);
    }
    const usedPlanIds = new Set(raw.markers.map((marker) => marker.planId));
    return {
      visit: {
        id: raw.visit.id,
        title: raw.visit.title,
        type: raw.visit.type,
        reason: raw.visit.reason,
        status: raw.visit.status,
        visitDate: raw.visit.visitDate,
        subject: raw.visit.subject,
        completedAt: raw.visit.completedAt?.toISOString() ?? null,
        writerName: raw.visit.writerName,
        coverPhotoId: raw.photos.find((photo) => photo.isCover)?.id ?? null,
        site: raw.visit.site,
      },
      participants: raw.participants,
      zones: raw.zones,
      photos: raw.photos.map((photo) => ({
        id: photo.id,
        zoneKey: photo.zoneKey,
        caption: photo.caption,
        category: photo.category ?? "general",
        isCover: photo.isCover,
        takenAt: photo.takenAt?.toISOString() ?? null,
        sortOrder: photo.sortOrder,
        createdAt: photo.createdAt.toISOString(),
        image: {
          key: `photo:${photo.id}`,
          url: photoUrls[photo.storagePath] ?? null,
          width: photo.width,
          height: photo.height,
        },
        markerIds: markersByPhoto.get(photo.id) ?? [],
        reserveIds: reservesByPhoto.get(photo.id) ?? [],
      })),
      plans: raw.plans
        .filter((plan) => usedPlanIds.has(plan.id))
        .map((plan) => {
          const markers = raw.markers.filter((marker) => marker.planId === plan.id);
          const markedPages = new Set(markers.map((marker) => marker.page));
          return {
            id: plan.id,
            name: plan.name,
            isArchived: plan.isArchived,
            pages: plan.pages
              .filter((page) => markedPages.has(page.pageNumber))
              .map((page) => ({
                pageNumber: page.pageNumber,
                image: {
                  key: `page:${plan.id}:${page.pageNumber}`,
                  url: pageUrls[page.imagePath] ?? null,
                  width: page.width,
                  height: page.height,
                },
              })),
            markers,
          };
        }),
      reserves: raw.reserves.map((reserve) => ({
        ...reserve,
        closedAt: reserve.closedAt?.toISOString() ?? null,
        photoIds: photosByReserve.get(reserve.id) ?? [],
      })),
      report,
      urlsExpireAt: new Date(Date.now() + READ_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }

  return {
    async getData(visitId) {
      const { raw, nextNumber, isDraft } = await repository.readData(visitId);
      return toData(raw, {
        id: null,
        number: nextNumber,
        generatedByName: raw.generatedByName,
        isDraft,
      });
    },

    async start(visitId, options) {
      await purgeStalePendingReports(storage);
      const { report, raw } = await repository.start(visitId, options);
      const data = await toData(raw, {
        id: report.id,
        number: report.number,
        generatedByName: raw.generatedByName,
        isDraft: report.isDraft,
      });
      return { reportId: report.id, number: report.number, fileName: report.fileName, data };
    },

    async uploadTarget(reportId, sizeBytes) {
      if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
        throw new ValidationError("Taille du rapport invalide.");
      }
      if (sizeBytes > REPORT_MAX_BYTES) throw new ValidationError(REPORT_TOO_LARGE_MESSAGE);
      const report = await repository.findOwnPending(reportId);
      const target = await storage.createSignedUpload(REPORTS_BUCKET, report.storagePath, {
        contentType: "application/pdf",
        maxBytes: sizeBytes,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      });
      return {
        url: target.url,
        headers: target.headers,
        expiresAt: target.expiresAt.toISOString(),
      };
    },

    async confirm(reportId, sizeBytes, pageCount) {
      let report: ReportRecord;
      try {
        report = await repository.findOwnPending(reportId);
      } catch (error) {
        if (error instanceof ValidationError) {
          // Already ready (double confirmation): answer with the report.
          const ready = await repository.findReady(reportId).catch(() => null);
          if (ready) return { ok: true, report: toView(ready) };
        }
        if (error instanceof NotFoundError || error instanceof ValidationError) {
          return { ok: false, error: error.message, retryable: false };
        }
        throw error;
      }
      const object = await storage.stat(REPORTS_BUCKET, report.storagePath);
      if (!object) return { ok: false, error: MISSING_FILE_MESSAGE, retryable: true };
      if (object.size !== sizeBytes)
        return { ok: false, error: SIZE_MISMATCH_MESSAGE, retryable: true };
      if (!/^application\/pdf\b/.test(object.contentType)) {
        return { ok: false, error: "Le fichier envoyé n'est pas un PDF.", retryable: false };
      }
      const ready = await repository.markReady(reportId, object.size, pageCount);
      return { ok: true, report: toView(ready) };
    },

    async list(visitId) {
      await purgeStalePendingReports(storage);
      return (await repository.listReady(visitId)).map(toView);
    },

    async lastOptions(visitId) {
      return readReportOptions(await repository.lastOptions(visitId));
    },

    async downloadUrl(reportId) {
      const report = await repository.findReady(reportId);
      const url = await storage.createSignedRead(
        REPORTS_BUCKET,
        report.storagePath,
        READ_URL_TTL_SECONDS,
        {
          downloadName: report.fileName,
        },
      );
      return { url, visitId: report.visitId };
    },

    async renewImageUrls(visitId, keys) {
      const photoIds: string[] = [];
      const pages: Array<{ planId: string; pageNumber: number }> = [];
      for (const key of keys) {
        const [kind, id, page] = key.split(":");
        if (kind === "photo" && id) photoIds.push(id);
        if (kind === "page" && id && page) pages.push({ planId: id, pageNumber: Number(page) });
      }
      const paths = await repository.imagePaths(visitId, photoIds, pages);
      const photoPaths = Object.values(paths.photos);
      const pagePaths = Object.values(paths.pages);
      const [photoUrls, pageUrls] = await Promise.all([
        photoPaths.length > 0
          ? storage.createSignedReads(PHOTOS_BUCKET, photoPaths, READ_URL_TTL_SECONDS)
          : Promise.resolve({} as Record<string, string>),
        pagePaths.length > 0
          ? storage.createSignedReads(PLANS_BUCKET, pagePaths, READ_URL_TTL_SECONDS)
          : Promise.resolve({} as Record<string, string>),
      ]);
      const result: Record<string, string> = {};
      for (const [id, path] of Object.entries(paths.photos)) {
        const url = photoUrls[path];
        if (url) result[`photo:${id}`] = url;
      }
      for (const [key, path] of Object.entries(paths.pages)) {
        const url = pageUrls[path];
        if (url) result[`page:${key}`] = url;
      }
      return result;
    },
  };
}
