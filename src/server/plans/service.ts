import "server-only";

import type { UserRef } from "@/server/db/context";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { log } from "@/server/log";
import {
  READ_URL_TTL_SECONDS,
  type StorageService,
  UPLOAD_URL_TTL_SECONDS,
} from "@/server/storage/types";

import {
  createMarkerRepository,
  createPlanRepository,
  deleteCancelledPlanRow,
  type MarkerRepository,
  type PlanPaths,
  type PlanRepository,
  purgeStalePendingPlanRows,
} from "./repository";
import type {
  ConfirmPlanResult,
  MarkerRecord,
  MarkerView,
  PlanDetailView,
  PlanPageRecord,
  PlanRecord,
  PlanView,
  PreparedPageUpload,
  PreparedPlanUpload,
  PreparePageInput,
  PreparePlanInput,
} from "./types";

const BUCKET = "site-plans";
const PHOTOS_BUCKET = "visit-photos";
const MISSING_OBJECT_MESSAGE = "Fichier manquant : l'envoi n'a pas abouti.";
const SIZE_MISMATCH_MESSAGE = "Fichier incomplet : l'envoi n'a pas abouti.";
const WRONG_TYPE_MESSAGE = "Le type d'un fichier envoyé ne correspond pas.";
const NO_PAGES_MESSAGE = "Aucune page convertie.";

const PURGE_MIN_INTERVAL_MS = 60_000;
let lastPurgeAt = 0;

/**
 * Plan and marker use cases for one verified user. The repositories enforce the rights
 * through RLS; the storage only signs URLs for rows they returned: **no signed URL without a
 * `withUser` check**.
 */
export interface PlanService {
  /** Ready plans of a site, with the first-page thumbnail URL. */
  listForSite(siteId: string, options?: { includeArchived?: boolean }): Promise<PlanView[]>;
  /** Plans offered in a visit: not archived, plus archived ones that carry markers of the visit. */
  listForVisit(visitId: string, siteId: string): Promise<PlanView[]>;
  /** A plan with its pages' URLs and the original download URL. */
  getDetail(planId: string, visitId?: string): Promise<PlanDetailView>;
  prepare(siteId: string, input: PreparePlanInput): Promise<PreparedPlanUpload>;
  preparePages(planId: string, pages: PreparePageInput[]): Promise<PreparedPageUpload[]>;
  /** Fresh upload URLs for a pending plan (expired URL), original and pages. */
  renewUploads(
    planId: string,
  ): Promise<{ original: PreparedPlanUpload; pages: PreparedPageUpload[] }>;
  confirm(planId: string): Promise<ConfirmPlanResult>;
  /** Cancels an import: pages and row removed, objects deleted. */
  discard(planId: string): Promise<void>;
  rename(planId: string, name: string): Promise<PlanView>;
  setArchived(planId: string, archived: boolean): Promise<PlanView>;
  markers: {
    listForVisit(visitId: string): Promise<MarkerView[]>;
    create(visitId: string, input: Parameters<MarkerRepository["create"]>[1]): Promise<MarkerView>;
    move(markerId: string, x: number, y: number): Promise<MarkerView>;
    update(
      markerId: string,
      patch: { label?: string | null; photoId?: string | null },
    ): Promise<MarkerView>;
    remove(markerId: string): Promise<void>;
    countWithoutPhoto(visitId: string): Promise<number>;
    byPhotoIds: MarkerRepository["byPhotoIds"];
  };
}

function toPlanView(plan: PlanRecord, thumbUrl: string | null, markersCount: number): PlanView {
  return {
    id: plan.id,
    siteId: plan.siteId,
    name: plan.name,
    mimeType: plan.mimeType,
    pageCount: plan.pageCount,
    isArchived: plan.isArchived,
    uploadedByName: plan.uploadedByName,
    createdAt: plan.createdAt.toISOString(),
    thumbUrl,
    markersCount,
  };
}

/** Removes objects of plans; failures are logged (the purge retries), never thrown. */
async function removePlanObjects(storage: StorageService, plans: PlanPaths[]): Promise<void> {
  const paths = plans.flatMap((plan) => [plan.storagePath, ...plan.pagePaths]);
  if (paths.length === 0) return;
  try {
    await storage.remove(BUCKET, paths);
  } catch (error) {
    log.error("plans.remove_objects_failed", {
      count: paths.length,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Purges stale pending plans (rows then objects), at most once a minute per process. Called
 * when the Plans tab loads; a scheduled task replaces it at step 11.
 */
export async function purgeStalePendingPlans(
  storage: StorageService,
  options: { force?: boolean } = {},
): Promise<number> {
  const now = Date.now();
  if (!options.force && now - lastPurgeAt < PURGE_MIN_INTERVAL_MS) return 0;
  lastPurgeAt = now;
  try {
    const purged = await purgeStalePendingPlanRows();
    await removePlanObjects(storage, purged);
    if (purged.length > 0) log.info("plans.purged", { count: purged.length });
    return purged.length;
  } catch (error) {
    log.error("plans.purge_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/** Creates the service for a verified user and a storage backend. */
export function createPlanService(
  user: UserRef,
  storage: StorageService,
  plans: PlanRepository = createPlanRepository(user),
  markers: MarkerRepository = createMarkerRepository(user),
): PlanService {
  async function signUpload(
    path: string,
    contentType: PlanRecord["mimeType"] | "image/png" | "image/jpeg",
    maxBytes: number,
  ) {
    const target = await storage.createSignedUpload(BUCKET, path, {
      contentType,
      maxBytes,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });
    return { url: target.url, headers: target.headers, expiresAt: target.expiresAt.toISOString() };
  }

  async function signPages(pages: PlanPageRecord[]): Promise<PreparedPageUpload[]> {
    return Promise.all(
      pages.map(async (page) => ({
        pageNumber: page.pageNumber,
        image: await signUpload(page.imagePath, page.imageMime, page.sizeBytes),
        // Thumbnail sizes are not stored: the 4 MB rule applies.
        thumb: await signUpload(page.thumbPath, "image/jpeg", 4 * 1024 * 1024),
      })),
    );
  }

  async function viewsWithThumbs(
    plans: Array<PlanRecord & { firstThumbPath: string | null }>,
    counts: Record<string, number>,
  ): Promise<PlanView[]> {
    const paths = plans.flatMap((plan) => (plan.firstThumbPath ? [plan.firstThumbPath] : []));
    const urls =
      paths.length > 0 ? await storage.createSignedReads(BUCKET, paths, READ_URL_TTL_SECONDS) : {};
    return plans.map((plan) =>
      toPlanView(
        plan,
        plan.firstThumbPath ? (urls[plan.firstThumbPath] ?? null) : null,
        counts[plan.id] ?? 0,
      ),
    );
  }

  async function markerViews(records: MarkerRecord[]): Promise<MarkerView[]> {
    const paths = records.flatMap((m) => (m.photoThumbPath ? [m.photoThumbPath] : []));
    const urls =
      paths.length > 0
        ? await storage.createSignedReads(PHOTOS_BUCKET, paths, READ_URL_TTL_SECONDS)
        : {};
    return records.map((m) => ({
      id: m.id,
      visitId: m.visitId,
      planId: m.planId,
      page: m.page,
      x: m.x,
      y: m.y,
      number: m.number,
      label: m.label,
      photoId: m.photoId,
      photoThumbUrl: m.photoThumbPath ? (urls[m.photoThumbPath] ?? null) : null,
      photoCaption: m.photoCaption,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));
  }

  return {
    async listForSite(siteId, options) {
      await purgeStalePendingPlans(storage);
      return viewsWithThumbs(await plans.listForSite(siteId, options), {});
    },

    async listForVisit(visitId, siteId) {
      await purgeStalePendingPlans(storage);
      const [all, counts] = await Promise.all([
        plans.listForSite(siteId, { includeArchived: true }),
        plans.markerCountsForVisit(visitId),
      ]);
      const offered = all.filter((plan) => !plan.isArchived || (counts[plan.id] ?? 0) > 0);
      return viewsWithThumbs(offered, counts);
    },

    async getDetail(planId, visitId) {
      const { plan, pages } = await plans.getWithPages(planId);
      if (plan.uploadStatus !== "ready") throw new NotFoundError("Plan introuvable.");
      const counts = visitId ? await plans.markerCountsForVisit(visitId) : {};
      const paths = [
        plan.storagePath,
        ...pages.flatMap((page) => [page.imagePath, page.thumbPath]),
      ];
      const urls = await storage.createSignedReads(BUCKET, paths, READ_URL_TTL_SECONDS);
      const expiresAt = new Date(Date.now() + READ_URL_TTL_SECONDS * 1000).toISOString();
      const first = pages[0];
      return {
        ...toPlanView(plan, first ? (urls[first.thumbPath] ?? null) : null, counts[plan.id] ?? 0),
        originalUrl: urls[plan.storagePath] ?? null,
        pages: pages.map((page) => ({
          pageNumber: page.pageNumber,
          width: page.width,
          height: page.height,
          imageMime: page.imageMime,
          imageUrl: urls[page.imagePath] ?? null,
          thumbUrl: urls[page.thumbPath] ?? null,
          urlsExpireAt: expiresAt,
        })),
      };
    },

    async prepare(siteId, input) {
      const plan = await plans.createPending(siteId, input);
      return {
        planId: plan.id,
        original: await signUpload(plan.storagePath, plan.mimeType, input.sizeBytes),
      };
    },

    async preparePages(planId, pageInputs) {
      const { pages } = await plans.addPages(planId, pageInputs);
      const requested = new Set(pageInputs.map((page) => page.pageNumber));
      return signPages(pages.filter((page) => requested.has(page.pageNumber)));
    },

    async renewUploads(planId) {
      const { plan, pages } = await plans.findPendingForUpload(planId);
      const original = await storage.stat(BUCKET, plan.storagePath);
      return {
        original: {
          planId: plan.id,
          original: await signUpload(
            plan.storagePath,
            plan.mimeType,
            original?.size ?? 50 * 1024 * 1024,
          ),
        },
        pages: await signPages(pages),
      };
    },

    async confirm(planId) {
      let plan: PlanRecord;
      let pages: PlanPageRecord[];
      try {
        ({ plan, pages } = await plans.findPendingForUpload(planId));
      } catch (error) {
        if (error instanceof ValidationError) {
          // Already ready (double confirmation): answer with the plan as it is.
          const { plan: ready } = await plans.getWithPages(planId);
          return { ok: true, plan: toPlanView(ready, null, 0) };
        }
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          return { ok: false, error: error.message, retryable: false };
        }
        throw error;
      }
      if (pages.length === 0) return { ok: false, error: NO_PAGES_MESSAGE, retryable: false };
      if (pages.length !== plan.pageCount) {
        return { ok: false, error: MISSING_OBJECT_MESSAGE, retryable: true };
      }
      const original = await storage.stat(BUCKET, plan.storagePath);
      if (!original) return { ok: false, error: MISSING_OBJECT_MESSAGE, retryable: true };
      if (!original.contentType.startsWith(plan.mimeType)) {
        return { ok: false, error: WRONG_TYPE_MESSAGE, retryable: false };
      }
      for (const page of pages) {
        const [image, thumb] = await Promise.all([
          storage.stat(BUCKET, page.imagePath),
          storage.stat(BUCKET, page.thumbPath),
        ]);
        if (!image || !thumb) return { ok: false, error: MISSING_OBJECT_MESSAGE, retryable: true };
        if (image.size !== page.sizeBytes) {
          return { ok: false, error: SIZE_MISMATCH_MESSAGE, retryable: true };
        }
        if (
          !image.contentType.startsWith(page.imageMime) ||
          !thumb.contentType.startsWith("image/jpeg")
        ) {
          return { ok: false, error: WRONG_TYPE_MESSAGE, retryable: false };
        }
      }
      let ready: PlanRecord;
      try {
        ready = await plans.markReady(planId);
      } catch (error) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          return { ok: false, error: error.message, retryable: false };
        }
        throw error;
      }
      const first = pages[0]!;
      const urls = await storage.createSignedReads(BUCKET, [first.thumbPath], READ_URL_TTL_SECONDS);
      return { ok: true, plan: toPlanView(ready, urls[first.thumbPath] ?? null, 0) };
    },

    async discard(planId) {
      const paths = await plans.discardPending(planId);
      if (!paths) return;
      await deleteCancelledPlanRow(user, planId);
      await removePlanObjects(storage, [paths]);
    },

    async rename(planId, name) {
      const plan = await plans.rename(planId, name);
      const [view] = await viewsWithThumbs(
        (await plans.listForSite(plan.siteId, { includeArchived: true })).filter(
          (p) => p.id === planId,
        ),
        {},
      );
      return view ?? toPlanView(plan, null, 0);
    },

    async setArchived(planId, archived) {
      const plan = await plans.setArchived(planId, archived);
      const [view] = await viewsWithThumbs(
        (await plans.listForSite(plan.siteId, { includeArchived: true })).filter(
          (p) => p.id === planId,
        ),
        {},
      );
      return view ?? toPlanView(plan, null, 0);
    },

    markers: {
      async listForVisit(visitId) {
        return markerViews(await markers.listForVisit(visitId));
      },
      async create(visitId, input) {
        const [view] = await markerViews([await markers.create(visitId, input)]);
        return view!;
      },
      async move(markerId, x, y) {
        const [view] = await markerViews([await markers.move(markerId, x, y)]);
        return view!;
      },
      async update(markerId, patch) {
        const [view] = await markerViews([await markers.update(markerId, patch)]);
        return view!;
      },
      remove(markerId) {
        return markers.remove(markerId);
      },
      countWithoutPhoto(visitId) {
        return markers.countWithoutPhoto(visitId);
      },
      byPhotoIds(photoIds) {
        return markers.byPhotoIds(photoIds);
      },
    },
  };
}
