import Dexie, { type Table, type Transaction } from "dexie";

import type { ReportOptions } from "@/lib/report/options";
import type { Participant } from "@/server/domain";
import type { ZoneNoteView } from "@/server/domain/zone-notes";
import type { PhotoView } from "@/server/photos/types";
import type { MarkerView, PlanPageView, PlanView } from "@/server/plans/types";
import type { AssignableProfile } from "@/server/repositories/profile-repository";
import type { ReportView } from "@/server/reports/service";
import type { ReserveDetail } from "@/server/reserves/types";

import type { SyncKind, SyncRejectionCode } from "./ops";
import type { VisitView } from "./snapshot";

/*
 * Local store of the device (IndexedDB through Dexie), one database per user:
 * `ronde-<userId>`. It holds the visits kept offline, their children, the images as blobs,
 * the outbox (operations waiting for the server), the conflicts to arbitrate and a few
 * metadata. Nothing here is a secret: no token, no password. See docs/offline.md.
 */

/** A visit of the local store. */
export interface LocalVisit extends VisitView {
  /** Kept offline (explicit or automatic): its images are downloaded and it stays after sign-out warning. */
  kept: boolean;
  keptAt: string | null;
  /** Server time of the last snapshot merged. */
  snapshotAt: string;
  /** Profiles that can be chosen as writer or participant (names only). */
  writers: AssignableProfile[];
  reportOptions: ReportOptions;
  canCreate: boolean;
  /** Role of the user who stored the visit (the database is already per user). */
  userRole: "rt" | "direction" | "admin";
}

export interface LocalParticipant extends Participant {
  visitId: string;
}

export interface LocalNote extends ZoneNoteView {
  visitId: string;
}

/** A photo, ready on the server or still waiting in the outbox (`uploadStatus: "pending"`). */
export interface LocalPhoto extends PhotoView {
  uploadStatus: "pending" | "ready";
}

export interface LocalPlan extends PlanView {
  visitId: string;
  /** Signed URL of the original file, usable while online. */
  originalUrl: string | null;
}

/** A page of a plan; key `${planId}:${pageNumber}`. */
export interface LocalPlanPage extends PlanPageView {
  key: string;
  planId: string;
}

/** A marker; `number` is null until the server assigns it (shown « • »). */
export interface LocalMarker extends Omit<MarkerView, "number"> {
  number: number | null;
}

/** A reserve; `number` is null and `code` is « R-? » until the server assigns it. */
export interface LocalReserve extends Omit<ReserveDetail, "number"> {
  number: number | null;
}

export interface LocalReport extends ReportView {
  visitId: string;
}

/** An image of the offline copy: `${photoId}:main`, `${photoId}:thumb`, `${planId}:${page}:image|thumb`. */
export interface LocalBlob {
  key: string;
  visitId: string;
  blob: Blob;
  size: number;
}

export type OutboxStatus = "pending" | "sending" | "rejected" | "blocked";

/** Progress of the three stages of a photo upload. */
export interface OutboxPhotoState {
  stage: "create" | "put" | "confirm";
  name: string;
  progress: number;
  upload: {
    main: { url: string; headers: Record<string, string>; expiresAt: string };
    thumb: { url: string; headers: Record<string, string>; expiresAt: string };
  } | null;
}

/** One operation waiting for the server. */
export interface OutboxEntry {
  opId: string;
  /** Order of creation (monotonic, per database). */
  seq: number;
  visitId: string;
  kind: SyncKind;
  entityId: string;
  payload: unknown;
  baseVersion?: number;
  /** Entity whose version the operation checks: `visit:<id>`, `note:<id>`, `reserve:<id>`. */
  versionScope?: string;
  /** Operations that must be applied first (creations of the entities the payload cites). */
  dependsOn: string[];
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  /** Why the server refused the operation for good (`status: "rejected"`). */
  rejection: { code: SyncRejectionCode; message: string } | null;
  /** Operation or conflict that blocks this one (`status: "blocked"`). */
  blockedBy: string | null;
  /** Plain-language description (« Note : Toiture »), fixed at creation. */
  label: string;
  photo: OutboxPhotoState | null;
  createdAt: string;
  updatedAt: string;
}

/** Local input set aside after the server kept its own version. */
export interface ConflictEntry {
  id: string;
  visitId: string;
  kind: SyncKind;
  entityId: string;
  versionScope: string;
  label: string;
  /** What the device wanted to write (the payload of the operation). */
  mine: unknown;
  /** What the server holds (the `current` of the result). */
  theirs: unknown;
  /** Version to send after arbitration. */
  serverVersion: number;
  message: string;
  createdAt: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

/** Name of the database of a user. */
export function localDbName(userId: string): string {
  return `ronde-${userId}`;
}

/**
 * Schema versions, oldest first. **Never edit a published version**: add a new one with the
 * stores that change and an `upgrade` callback when rows must be converted. The outbox is kept
 * across versions (tested with fake-indexeddb).
 */
export const LOCAL_SCHEMA_VERSIONS: Array<{
  version: number;
  stores: Record<string, string | null>;
  upgrade?: (transaction: Transaction) => Promise<void> | void;
}> = [
  {
    version: 1,
    stores: {
      visits: "id, kept",
      participants: "id, visitId",
      notes: "id, visitId, [visitId+zoneKey]",
      photos: "id, visitId, uploadStatus",
      plans: "id, visitId",
      planPages: "key, planId",
      markers: "id, visitId, planId",
      reserves: "id, visitId",
      reports: "id, visitId",
      blobs: "key, visitId",
      outbox: "opId, seq, visitId, entityId, status, [visitId+seq]",
      conflicts: "id, visitId, entityId",
      meta: "key",
    },
  },
];

/** The local database of one user. */
export class RondeLocalDb extends Dexie {
  visits!: Table<LocalVisit, string>;
  participants!: Table<LocalParticipant, string>;
  notes!: Table<LocalNote, string>;
  photos!: Table<LocalPhoto, string>;
  plans!: Table<LocalPlan, string>;
  planPages!: Table<LocalPlanPage, string>;
  markers!: Table<LocalMarker, string>;
  reserves!: Table<LocalReserve, string>;
  reports!: Table<LocalReport, string>;
  blobs!: Table<LocalBlob, string>;
  outbox!: Table<OutboxEntry, string>;
  conflicts!: Table<ConflictEntry, string>;
  meta!: Table<MetaEntry, string>;

  readonly userId: string;

  constructor(userId: string, versions = LOCAL_SCHEMA_VERSIONS) {
    super(localDbName(userId));
    this.userId = userId;
    for (const definition of versions) {
      const version = this.version(definition.version).stores(definition.stores);
      if (definition.upgrade) version.upgrade(definition.upgrade);
    }
  }
}

/** Opens (and creates or migrates) the database of a user. */
export function openLocalDb(userId: string): RondeLocalDb {
  return new RondeLocalDb(userId);
}

/** Deletes the whole database of a user (sign-out, revocation, inactivity). */
export async function deleteLocalDb(userId: string): Promise<void> {
  await Dexie.delete(localDbName(userId));
}

/** Reads a metadata value. */
export async function readMeta<T>(db: RondeLocalDb, key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}

/** Writes a metadata value. */
export async function writeMeta(db: RondeLocalDb, key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Keys of the `meta` table. */
export const META_KEYS = {
  /** Last answer of the server, whatever the route (ISO 8601). */
  lastServerContactAt: "lastServerContactAt",
  /** Last successful synchronisation (ISO 8601). */
  lastSyncAt: "lastSyncAt",
  /** Monotonic counter of the outbox. */
  outboxSeq: "outboxSeq",
  /** Keep automatically the visits opened on the tablet (default true). */
  autoKeep: "autoKeep",
} as const;

/** Meta key of the server time of the last answer applied for a visit. */
export const appliedAtKey = (visitId: string) => `appliedAt:${visitId}`;

/** Blob keys. */
export const blobKeys = {
  photoMain: (photoId: string) => `${photoId}:main`,
  photoThumb: (photoId: string) => `${photoId}:thumb`,
  pageImage: (planId: string, page: number) => `${planId}:${page}:image`,
  pageThumb: (planId: string, page: number) => `${planId}:${page}:thumb`,
};

export const planPageKey = (planId: string, page: number) => `${planId}:${page}`;
