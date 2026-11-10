import type { RondeLocalDb, OutboxEntry } from "./db";
import { META_KEYS } from "./db";
import { uuidv7 } from "./ids";
import type { SyncKind, SyncPayload } from "./ops";

/** What a screen gives when it writes; the outbox fills the rest. */
export interface NewOperation<K extends SyncKind = SyncKind> {
  visitId: string;
  kind: K;
  /** Entity the operation is about (visit id for visit-level operations). */
  entityId: string;
  payload: SyncPayload<K>;
  baseVersion?: number;
  /** `visit:<id>`, `note:<id>` or `reserve:<id>` for versioned operations. */
  versionScope?: string;
  /**
   * Version the screen shows, used only when the local copy does not hold the entity yet (a
   * change made right after the page appeared, before the snapshot is written to the store).
   */
  fallbackVersion?: number;
  label: string;
  /** Photo pipeline state (photo.create only). */
  photo?: OutboxEntry["photo"];
}

/** Kinds that create the entity they are about. */
export const CREATING_KINDS: readonly SyncKind[] = [
  "participant.add",
  "zone.add",
  "zone.addTemplate",
  "photo.create",
  "marker.create",
  "reserve.create",
];

/** Kinds that delete the entity they are about. */
export const DELETING_KINDS: readonly SyncKind[] = [
  "participant.remove",
  "zone.remove",
  "photo.delete",
  "marker.delete",
  "reserve.delete",
];

/** Identifiers of other entities an operation refers to (dependencies). */
export function referencedIds(kind: SyncKind, payload: unknown): string[] {
  const p = payload as Record<string, unknown>;
  switch (kind) {
    case "marker.create":
    case "marker.update":
      return typeof p.photoId === "string" ? [p.photoId] : [];
    case "reserve.create":
    case "reserve.update": {
      const values = p.values as { photoIds?: string[] } | undefined;
      return values?.photoIds ?? [];
    }
    case "reserve.attachMarker":
      return typeof p.markerId === "string" ? [p.markerId] : [];
    case "note.update":
      return typeof p.noteId === "string" ? [p.noteId] : [];
    case "zone.rename":
    case "zone.remove":
      return typeof p.noteId === "string" ? [p.noteId] : [];
    default:
      return [];
  }
}

function now(): string {
  return new Date().toISOString();
}

/** Pending operations of an entity, oldest first. */
async function pendingOf(db: RondeLocalDb, visitId: string, entityId: string) {
  const rows = await db.outbox
    .where("entityId")
    .equals(entityId)
    .filter((entry) => entry.visitId === visitId && entry.status === "pending")
    .toArray();
  return rows.sort((a, b) => a.seq - b.seq);
}

async function nextSeq(db: RondeLocalDb): Promise<number> {
  const row = await db.meta.get(META_KEYS.outboxSeq);
  const seq = (typeof row?.value === "number" ? row.value : 0) + 1;
  await db.meta.put({ key: META_KEYS.outboxSeq, value: seq });
  return seq;
}

type Payload = Record<string, unknown>;

/**
 * Folds `incoming` into an existing pending operation when that is safe, returning the
 * updated entry; `null` when nothing can be folded. Rules (see docs/offline.md):
 * - the same update of the same entity replaces the previous one (latest content wins);
 * - an update of an entity created offline is folded into its creation;
 * - a deletion of an entity created offline cancels everything about it (handled by the caller).
 */
function fold(existing: OutboxEntry, incoming: NewOperation): OutboxEntry | null {
  const current = existing.payload as Payload;
  const next = incoming.payload as Payload;
  const replace = (payload: unknown): OutboxEntry => ({
    ...existing,
    payload,
    label: existing.label,
    updatedAt: now(),
  });
  if (existing.kind === incoming.kind) {
    switch (incoming.kind) {
      case "note.update":
      case "visit.update":
      case "marker.move":
      case "reserve.place":
      case "participant.reorder":
      case "zone.reorder":
      case "reserve.setStatus":
        return replace(next);
      case "marker.update":
        return replace({ ...current, ...next });
      case "photo.update":
        return replace({
          ...current,
          patch: { ...(current.patch as Payload), ...(next.patch as Payload) },
        });
      case "participant.update":
        return replace({
          ...current,
          patch: { ...(current.patch as Payload), ...(next.patch as Payload) },
        });
      case "reserve.update":
      case "zone.rename":
        return replace(next);
      default:
        return null;
    }
  }
  // Updates folded into the pending creation of the entity.
  if (existing.kind === "marker.create" && incoming.kind === "marker.move") {
    return replace({ ...current, x: next.x, y: next.y });
  }
  if (existing.kind === "marker.create" && incoming.kind === "marker.update") {
    const patch: Payload = {};
    if (next.label !== undefined) patch.label = next.label;
    if (next.photoId !== undefined) patch.photoId = next.photoId;
    return replace({ ...current, ...patch });
  }
  if (existing.kind === "reserve.create" && incoming.kind === "reserve.update") {
    return replace({ ...current, values: next.values });
  }
  if (existing.kind === "participant.add" && incoming.kind === "participant.update") {
    const participant = current.participant as Payload;
    return replace({ ...current, participant: { ...participant, ...(next.patch as Payload) } });
  }
  if (existing.kind === "zone.add" && incoming.kind === "zone.rename") {
    return replace({ ...current, label: next.label });
  }
  if (existing.kind === "photo.create" && incoming.kind === "photo.update") {
    // Only the zone exists at creation; caption and category must follow the confirmation.
    const patch = next.patch as Payload;
    if (patch.zoneKey !== undefined && Object.keys(patch).length === 1) {
      const item = current.item as Payload;
      return replace({ ...current, item: { ...item, zoneKey: patch.zoneKey } });
    }
    return null;
  }
  return null;
}

/**
 * Version the device knows for a scope (`visit:<id>`, `note:<id>`, `reserve:<id>`). Read in the
 * same transaction as the queueing: a result applied meanwhile advances the version and rebases
 * the queued operations atomically, so a new operation never carries a stale base.
 */
export async function scopeVersion(db: RondeLocalDb, scope: string): Promise<number | undefined> {
  const [kind, id] = scope.split(":") as [string, string];
  if (kind === "visit") return (await db.visits.get(id))?.version;
  if (kind === "note") return (await db.notes.get(id))?.version;
  if (kind === "reserve") return (await db.reserves.get(id))?.version;
  return undefined;
}

/** Outcome of an `enqueue`: the entry sent later, or nothing when operations cancelled out. */
export type EnqueueOutcome =
  | { kind: "queued"; entry: OutboxEntry; folded: boolean }
  | { kind: "cancelled"; removedOpIds: string[] };

/**
 * Adds an operation to the outbox, folding it into a pending operation when that is safe,
 * and records the operations it depends on (pending creations of the entities it cites).
 * Runs in its own transaction; the caller applies the optimistic change to the store.
 */
export async function enqueueOperation(
  db: RondeLocalDb,
  operation: NewOperation,
): Promise<EnqueueOutcome> {
  return db.transaction("rw", [db.outbox, db.meta, db.visits, db.notes, db.reserves], async () => {
    if (operation.versionScope && operation.baseVersion === undefined) {
      const stored = await scopeVersion(db, operation.versionScope);
      operation = { ...operation, baseVersion: stored ?? operation.fallbackVersion };
    }
    const pending = await pendingOf(db, operation.visitId, operation.entityId);
    const creation = pending.find((entry) => CREATING_KINDS.includes(entry.kind));

    if (DELETING_KINDS.includes(operation.kind) && creation) {
      // Created then deleted before any sync: nothing to send at all.
      const ids = pending.map((entry) => entry.opId);
      await db.outbox.bulkDelete(ids);
      return { kind: "cancelled", removedOpIds: ids };
    }

    for (const existing of [...pending].reverse()) {
      const folded = fold(existing, operation);
      if (folded) {
        await db.outbox.put(folded);
        return { kind: "queued", entry: folded, folded: true };
      }
    }

    if (DELETING_KINDS.includes(operation.kind) && pending.length > 0) {
      // Earlier updates are pointless once the entity is deleted.
      await db.outbox.bulkDelete(pending.map((entry) => entry.opId));
    }

    const cited = [operation.entityId, ...referencedIds(operation.kind, operation.payload)];
    const dependsOn = new Set<string>();
    for (const id of cited) {
      const creations = await db.outbox
        .where("entityId")
        .equals(id)
        .filter(
          (entry) =>
            CREATING_KINDS.includes(entry.kind) ||
            entry.kind === "reserve.place" ||
            entry.kind === "photo.confirm",
        )
        .toArray();
      for (const entry of creations) dependsOn.add(entry.opId);
    }
    // A reserve placed on the plan depends on the marker's creation only through the server.
    if (operation.kind === "reserve.place" || operation.kind === "reserve.attachMarker") {
      const markerId = (operation.payload as Payload).markerId;
      if (typeof markerId === "string") {
        for (const entry of await db.outbox.where("entityId").equals(markerId).toArray()) {
          dependsOn.add(entry.opId);
        }
      }
    }

    const entry: OutboxEntry = {
      opId: uuidv7(),
      seq: await nextSeq(db),
      visitId: operation.visitId,
      kind: operation.kind,
      entityId: operation.entityId,
      payload: operation.payload,
      baseVersion: operation.baseVersion,
      versionScope: operation.versionScope,
      dependsOn: [...dependsOn],
      status: "pending",
      attempts: 0,
      lastError: null,
      rejection: null,
      blockedBy: null,
      label: operation.label,
      photo: operation.photo ?? null,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.outbox.add(entry);
    return { kind: "queued", entry, folded: false };
  });
}

/** Pending or blocked operations of a visit, in order. */
export async function listOutbox(db: RondeLocalDb, visitId?: string): Promise<OutboxEntry[]> {
  const rows = visitId
    ? await db.outbox.where("visitId").equals(visitId).toArray()
    : await db.outbox.toArray();
  return rows.sort((a, b) => a.seq - b.seq);
}

/** Set of entity ids with at least one operation waiting (pending dots). */
export async function pendingEntityIds(db: RondeLocalDb, visitId: string): Promise<Set<string>> {
  const rows = await db.outbox.where("visitId").equals(visitId).toArray();
  return new Set(rows.map((entry) => entry.entityId));
}

/**
 * After an operation is applied with a new version, the later operations of the same version
 * scope that carried the same base are rebased on the returned version (chained versions).
 */
export async function rebaseScope(
  db: RondeLocalDb,
  scope: string,
  fromVersion: number | undefined,
  toVersion: number,
): Promise<void> {
  const rows = await db.outbox
    .filter((entry) => entry.versionScope === scope && entry.baseVersion === fromVersion)
    .toArray();
  for (const entry of rows) {
    await db.outbox.update(entry.opId, { baseVersion: toVersion, updatedAt: now() });
  }
}

/** Marks every operation depending (transitively) on `opId` as blocked by it. */
export async function blockDependents(
  db: RondeLocalDb,
  opId: string,
  blockedBy: string,
): Promise<string[]> {
  const all = await db.outbox.toArray();
  const blocked: string[] = [];
  const queue = [opId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const entry of all) {
      if (entry.dependsOn.includes(current) && !blocked.includes(entry.opId)) {
        blocked.push(entry.opId);
        queue.push(entry.opId);
      }
    }
  }
  for (const id of blocked) {
    await db.outbox.update(id, { status: "blocked", blockedBy, updatedAt: now() });
  }
  return blocked;
}

/** Operations blocked by `blockerId` go back to pending (the blocker is gone or resolved). */
export async function unblock(db: RondeLocalDb, blockerId: string): Promise<void> {
  const rows = await db.outbox.where("status").equals("blocked").toArray();
  for (const entry of rows) {
    if (entry.blockedBy === blockerId) {
      await db.outbox.update(entry.opId, { status: "pending", blockedBy: null, updatedAt: now() });
    }
  }
}
