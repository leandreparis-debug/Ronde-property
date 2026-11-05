import "server-only";

import { formatDate } from "@/lib/format";
import type { ReserveWrite } from "@/lib/reserves/schema";
import type { UserRef } from "@/server/db/context";
import { RESERVE_PRIORITY_LABELS, type ReservePriority } from "@/server/domain/enums";
import { READ_URL_TTL_SECONDS, type StorageService } from "@/server/storage/types";

import {
  createReserveRepository,
  type PlacementInput,
  ReserveConflictError,
  type ReserveDetailRecord,
  type ReserveEventRecord,
  type ReserveRecord,
  type ReserveRepository,
} from "./repository";
import type {
  PhotoReserveLink,
  ReserveChange,
  ReserveDetail,
  ReserveHistoryEntry,
  ReserveIncompleteCounts,
  ReserveListItem,
  ReserveMarkerRef,
  ReserveSaveResult,
  ResponsibleSuggestions,
  SiteReservesSummary,
} from "./types";

const PHOTOS_BUCKET = "visit-photos";
/** Open reserves listed on the site page. */
export const SITE_RESERVES_LIMIT = 10;

/** Label of the responsible in lists: never the e-mail. */
export function responsibleLabel(record: {
  responsibleKind: ReserveRecord["responsibleKind"];
  responsibleDisplayName: string | null;
  responsibleName: string | null;
  responsibleCompany: string | null;
}): string | null {
  if (record.responsibleKind === "internal")
    return record.responsibleDisplayName ?? "Compte inconnu";
  if (record.responsibleKind === "external") {
    return [record.responsibleName, record.responsibleCompany].filter(Boolean).join(" · ") || null;
  }
  return null;
}

function toListItem(record: ReserveRecord, thumbUrl: string | null): ReserveListItem {
  return {
    id: record.id,
    visitId: record.visitId,
    siteId: record.siteId,
    number: record.number,
    code: record.code,
    action: record.action,
    zoneKey: record.zoneKey,
    zoneLabel: record.zoneLabel,
    priority: record.priority,
    responsibleKind: record.responsibleKind,
    responsibleLabel: responsibleLabel(record),
    responsibleInactive:
      record.responsibleKind === "internal" && record.responsibleIsActive === false,
    dueDate: record.dueDate,
    status: record.status,
    isOverdue: record.isOverdue,
    daysOverdue: record.daysOverdue,
    closedAt: record.closedAt?.toISOString() ?? null,
    closedByName: record.closedByName,
    photosCount: record.photosCount,
    firstThumbUrl: thumbUrl,
    marker: record.marker,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

const FIELD_LABELS: Record<string, string> = {
  action: "Action",
  description: "Description",
  zone_key: "Zone",
  priority: "Priorité",
  due_date: "Échéance",
  responsible: "Responsable",
  responsible_company: "Entreprise",
  responsible_email: "E-mail du responsable",
};
const NONE = "aucune";
const RESPONSIBLE_FIELDS = ["responsible_kind", "responsible_profile_id", "responsible_name"];

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Turns the raw diff of an event into readable changes (« Échéance : 12/11/2026 →
 * 30/11/2026 »). The responsible fields are merged into one « Responsable » line; technical
 * fields are left out.
 */
export function describeChanges(
  changes: ReserveEventRecord["changes"],
  names: Record<string, string>,
  zones: Record<string, string>,
): ReserveChange[] {
  const result: ReserveChange[] = [];
  const side = (key: "old" | "new") => {
    const profile = text(changes.responsible_profile_id?.[key]);
    if (profile) return names[profile] ?? "Compte inconnu";
    const name = text(changes.responsible_name?.[key]);
    if (name) return name;
    const kindChanged = changes.responsible_kind !== undefined;
    if (kindChanged && changes.responsible_kind?.[key] === null) return "À désigner";
    return NONE;
  };
  for (const [field, change] of Object.entries(changes)) {
    if (RESPONSIBLE_FIELDS.includes(field)) continue;
    const label = FIELD_LABELS[field];
    if (!label) continue;
    let from = text(change.old);
    let to = text(change.new);
    if (field === "due_date") {
      from = from ? formatDate(from) : null;
      to = to ? formatDate(to) : null;
    } else if (field === "priority") {
      from = from ? RESERVE_PRIORITY_LABELS[from as ReservePriority] : null;
      to = to ? RESERVE_PRIORITY_LABELS[to as ReservePriority] : null;
    } else if (field === "zone_key") {
      from = from ? (zones[from] ?? from) : null;
      to = to ? (zones[to] ?? to) : null;
    } else if (field === "description") {
      result.push({ field, label, from: "", to: "modifiée" });
      continue;
    } else if (field === "responsible_email") {
      // The history never holds the address (masked by the database since migration 19).
      result.push({ field, label, from: "", to: "modifié" });
      continue;
    }
    result.push({ field, label, from: from ?? NONE, to: to ?? NONE });
  }
  if (RESPONSIBLE_FIELDS.some((field) => changes[field] !== undefined)) {
    result.unshift({
      field: "responsible",
      label: FIELD_LABELS.responsible!,
      from: side("old"),
      to: side("new"),
    });
  }
  const order = Object.keys(FIELD_LABELS);
  return result.sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field));
}

/**
 * Reserve use cases for one verified user. The repository enforces the rights through RLS;
 * thumbnails are signed only for rows it returned (no signed URL without a `withUser` check).
 */
export interface ReserveService {
  listForVisit(visitId: string): Promise<ReserveListItem[]>;
  siteSummary(siteId: string): Promise<SiteReservesSummary>;
  get(id: string): Promise<ReserveDetail>;
  history(id: string): Promise<ReserveHistoryEntry[]>;
  create(visitId: string, input: ReserveWrite, photoIds: string[]): Promise<ReserveDetail>;
  update(
    id: string,
    input: ReserveWrite,
    expectedVersion: number,
    photoIds?: string[],
  ): Promise<ReserveSaveResult>;
  setStatus(id: string, status: ReserveDetail["status"]): Promise<ReserveDetail>;
  softDelete(id: string): Promise<void>;
  linkPhotos(id: string, photoIds: string[]): Promise<void>;
  unlinkPhoto(id: string, photoId: string): Promise<void>;
  placeOnPlan(id: string, placement: PlacementInput): Promise<ReserveMarkerRef>;
  removeFromPlan(id: string): Promise<void>;
  attachMarker(id: string, markerId: string): Promise<ReserveMarkerRef>;
  suggestions(siteId: string): Promise<ResponsibleSuggestions>;
  incompleteCounts(visitId: string): Promise<ReserveIncompleteCounts>;
  byPhotoIds(photoIds: string[]): Promise<Record<string, PhotoReserveLink[]>>;
}

/** Creates the service for a verified user and a storage backend. */
export function createReserveService(
  user: UserRef,
  storage: StorageService,
  repository: ReserveRepository = createReserveRepository(user),
): ReserveService {
  async function sign(paths: (string | null)[]): Promise<Record<string, string>> {
    const unique = [...new Set(paths.filter((path): path is string => !!path))];
    if (unique.length === 0) return {};
    return storage.createSignedReads(PHOTOS_BUCKET, unique, READ_URL_TTL_SECONDS);
  }

  async function listItems<T extends ReserveRecord>(records: T[]) {
    const urls = await sign(records.map((record) => record.firstThumbPath));
    return records.map((record) => ({
      record,
      item: toListItem(
        record,
        record.firstThumbPath ? (urls[record.firstThumbPath] ?? null) : null,
      ),
    }));
  }

  async function toDetail(record: ReserveDetailRecord): Promise<ReserveDetail> {
    const urls = await sign([
      record.firstThumbPath,
      ...record.photos.flatMap((photo) => [photo.thumbPath, photo.storagePath]),
    ]);
    return {
      ...toListItem(record, record.firstThumbPath ? (urls[record.firstThumbPath] ?? null) : null),
      description: record.description,
      responsibleProfileId: record.responsibleProfileId,
      responsibleName: record.responsibleName,
      responsibleCompany: record.responsibleCompany,
      responsibleEmail: record.responsibleEmail,
      createdByName: record.createdByName,
      visitTitle: record.visitTitle,
      visitStatus: record.visitStatus,
      markerPlanName: record.markerPlanName,
      photos: record.photos.map((photo) => ({
        id: photo.id,
        caption: photo.caption,
        zoneLabel: photo.zoneLabel,
        thumbUrl: photo.thumbPath ? (urls[photo.thumbPath] ?? null) : null,
        url: urls[photo.storagePath] ?? null,
      })),
    };
  }

  return {
    async listForVisit(visitId) {
      return (await listItems(await repository.listForVisit(visitId))).map(({ item }) => item);
    },

    async siteSummary(siteId) {
      const summary = await repository.listOpenForSite(siteId, SITE_RESERVES_LIMIT);
      const items = await listItems(summary.items);
      return {
        open: summary.open,
        overdue: summary.overdue,
        urgent: summary.urgent,
        items: items.map(({ record, item }) => ({
          ...item,
          visitTitle: record.visitTitle,
          visitDate: record.visitDate,
        })),
      };
    },

    async get(id) {
      return toDetail(await repository.get(id));
    },

    async history(id) {
      const { events, profileNames, zoneLabels } = await repository.history(id);
      return events.map((event) => ({
        id: event.id,
        type: event.type,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        changes:
          event.type === "updated" ? describeChanges(event.changes, profileNames, zoneLabels) : [],
        actorName: event.actorName,
        createdAt: event.createdAt.toISOString(),
      }));
    },

    async create(visitId, input, photoIds) {
      return toDetail(await repository.create(visitId, input, photoIds));
    },

    async update(id, input, expectedVersion, photoIds) {
      try {
        return {
          ok: true,
          reserve: await toDetail(await repository.update(id, input, expectedVersion, photoIds)),
        };
      } catch (error) {
        if (error instanceof ReserveConflictError) {
          return {
            ok: false,
            conflict: true,
            current: await toDetail(error.current),
            message: error.message,
          };
        }
        throw error;
      }
    },

    async setStatus(id, status) {
      return toDetail(await repository.setStatus(id, status));
    },

    softDelete: (id) => repository.softDelete(id),
    linkPhotos: (id, photoIds) => repository.linkPhotos(id, photoIds),
    unlinkPhoto: (id, photoId) => repository.unlinkPhoto(id, photoId),
    placeOnPlan: (id, placement) => repository.placeOnPlan(id, placement),
    removeFromPlan: (id) => repository.removeFromPlan(id),
    attachMarker: (id, markerId) => repository.attachMarker(id, markerId),
    suggestions: (siteId) => repository.suggestions(siteId),
    incompleteCounts: (visitId) => repository.incompleteCounts(visitId),
    byPhotoIds: (photoIds) => repository.byPhotoIds(photoIds),
  };
}
