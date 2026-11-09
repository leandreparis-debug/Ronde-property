import type { ConflictEntry, OutboxEntry, RondeLocalDb } from "./db";
import { appliedAtKey, blobKeys, META_KEYS, readMeta, writeMeta } from "./db";
import { applyLocally } from "./local-apply";
import type { SyncAuthFailure, SyncOperation, SyncResult } from "./ops";
import { enqueueOperation, type EnqueueOutcome, type NewOperation, unblock } from "./outbox";
import { applySyncResult, type OperationOutcome } from "./results";
import type { SyncTransport } from "./transport";
import { TransportError } from "./transport";

/** Observable state of the engine (header indicator, panel). */
export type SyncState = "idle" | "offline" | "syncing" | "error" | "conflict" | "auth";

export interface SyncStatus {
  state: SyncState;
  /** Operations waiting (pending, sending, blocked). */
  pending: number;
  /** Operations refused for good, kept for the user. */
  rejected: number;
  conflicts: number;
  lastSyncAt: string | null;
  /** Next automatic attempt (epoch ms), after a failure. */
  nextRetryAt: number | null;
  /** Last failure, in French. */
  message: string | null;
  /** The server refused the session. */
  authReason: SyncAuthFailure | null;
  /** Photo operations finished during this session (« Terminé » rows of the panel). */
  recent: Array<{ opId: string; photoId: string; label: string }>;
}

export interface SyncEngineDeps {
  db: RondeLocalDb;
  transport: SyncTransport;
  user: { id: string; name: string };
  isOnline: () => boolean;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** The server refused the session: the owner decides (ask to sign in, wipe). */
  onAuthFailure?: (reason: SyncAuthFailure) => void;
  /** Something was applied for this visit: the owner may refresh its snapshot. */
  onApplied?: (visitId: string) => void;
  /** Backoff after a failure: 1 s, 2 s, 4 s… up to 5 min by default. */
  backoff?: { baseMs: number; maxMs: number };
  /** Automatic flush while operations wait (30 s by default). */
  periodicMs?: number;
  uploadConcurrency?: number;
  batchSize?: number;
}

/** What `enqueue` gives back: the outcome of the queueing and a way to wait for the server. */
export interface Enqueued {
  outcome: EnqueueOutcome;
  /** Resolves when the server answered, or at once with `queued` when it cannot be reached. */
  wait(): Promise<OperationOutcome>;
}

export interface SyncEngine {
  /** Applies the operation locally, queues it and starts a flush when online. */
  enqueue(operation: NewOperation): Promise<Enqueued>;
  /** Stores the blobs of a photo taken on the device and queues its upload. */
  enqueuePhoto(input: {
    visitId: string;
    photoId: string;
    item: SyncOperation<"photo.create">["payload"]["item"];
    main: Blob;
    thumb: Blob;
    name: string;
  }): Promise<Enqueued>;
  /** Sends what waits, one visit after the other, in order. */
  flush(): Promise<void>;
  onStatus(listener: (status: SyncStatus) => void): () => void;
  status(): SyncStatus;
  pause(): void;
  resume(): void;
  /** Gives a rejected or failed operation another chance. */
  retry(opId: string): Promise<void>;
  /** Drops an operation (the user gives it up); a photo not yet confirmed loses its blobs. */
  remove(opId: string): Promise<void>;
  clearRecent(): void;
  /** Arbitration done: queues the chosen version on the server's version and unblocks. */
  resolveConflict(
    conflict: ConflictEntry,
    resolution: NewOperation | null,
  ): Promise<Enqueued | null>;
  /** Starts the automatic triggers (online, visibility, timer). */
  start(): () => void;
  dispose(): void;
}

const DEFAULT_BACKOFF = { baseMs: 1_000, maxMs: 300_000 };
const PHOTO_URL_REFUSED = [400, 401, 403, 410];

/** Delay before attempt `attempt` (0-based): 1 s, 2 s, 4 s… capped. */
export function backoffDelay(
  attempt: number,
  backoff: { baseMs: number; maxMs: number } = DEFAULT_BACKOFF,
): number {
  return Math.min(backoff.maxMs, backoff.baseMs * 2 ** Math.min(attempt, 30));
}

/**
 * Picks the operations of one visit that can be sent now: pending, deps already applied (no
 * longer in the outbox) or earlier in the same batch, photos at their `create` or `confirm`
 * stage only (the `put` stage is handled by the uploader).
 */
export function selectBatch(
  entries: OutboxEntry[],
  all: OutboxEntry[],
  size: number,
): OutboxEntry[] {
  const present = new Set(all.map((entry) => entry.opId));
  const batch: OutboxEntry[] = [];
  const inBatch = new Set<string>();
  for (const entry of entries) {
    if (entry.status !== "pending") continue;
    if (entry.photo && entry.photo.stage === "put") continue;
    const ready = entry.dependsOn.every((dep) => !present.has(dep) || inBatch.has(dep));
    if (!ready) continue;
    batch.push(entry);
    inBatch.add(entry.opId);
    if (batch.length >= size) break;
  }
  return batch;
}

/** Distinct, deterministic id of the confirmation step of a photo (still a valid UUID). */
export function confirmOpId(opId: string): string {
  const last = opId.slice(-1);
  return `${opId.slice(0, -1)}${last === "f" ? "e" : "f"}`;
}

function toOperation(entry: OutboxEntry): SyncOperation {
  const kind = entry.photo?.stage === "confirm" ? "photo.confirm" : entry.kind;
  const payload =
    entry.photo?.stage === "confirm" ? { id: entry.entityId } : (entry.payload as never);
  return {
    opId: entry.photo?.stage === "confirm" ? confirmOpId(entry.opId) : entry.opId,
    visitId: entry.visitId,
    kind,
    baseVersion: entry.baseVersion,
    payload,
  } as SyncOperation;
}

/** Creates the engine. Framework-free; the React provider owns one per signed-in user. */
export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const { db, transport } = deps;
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as number));
  const backoff = deps.backoff ?? DEFAULT_BACKOFF;
  const periodicMs = deps.periodicMs ?? 30_000;
  const uploadConcurrency = deps.uploadConcurrency ?? 3;
  const batchSize = deps.batchSize ?? 50;

  const listeners = new Set<(status: SyncStatus) => void>();
  const waiters = new Map<string, Array<(outcome: OperationOutcome) => void>>();
  let status: SyncStatus = {
    state: "idle",
    pending: 0,
    rejected: 0,
    conflicts: 0,
    lastSyncAt: null,
    nextRetryAt: null,
    message: null,
    authReason: null,
    recent: [],
  };
  let paused = false;
  let disposed = false;
  let current: Promise<void> | null = null;
  let rerun = false;
  /** Outcomes to deliver once the status is up to date (end of the flush). */
  let settlements: Array<[string, OperationOutcome]> = [];
  let failures = 0;
  let retryTimer: unknown = null;
  let periodicTimer: unknown = null;
  let lastSyncAt: string | null = null;

  function publish(patch: Partial<SyncStatus>) {
    status = { ...status, ...patch };
    for (const listener of listeners) listener(status);
  }

  async function counts() {
    const entries = await db.outbox.toArray();
    const conflicts = await db.conflicts.count();
    return {
      pending: entries.filter((entry) => entry.status !== "rejected").length,
      rejected: entries.filter((entry) => entry.status === "rejected").length,
      conflicts,
    };
  }

  /** Recomputes the state from the store after a flush or a change. */
  async function refresh(extra: Partial<SyncStatus> = {}) {
    if (disposed) return;
    const c = await counts();
    let state: SyncState;
    const authReason = extra.authReason === undefined ? status.authReason : extra.authReason;
    if (authReason) state = "auth";
    else if (c.conflicts > 0) state = "conflict";
    else if (c.rejected > 0 || (failures > 0 && c.pending > 0)) state = "error";
    else if (!deps.isOnline() && c.pending > 0) state = "offline";
    else if (!deps.isOnline()) state = "offline";
    else state = "idle";
    publish({ ...c, state, lastSyncAt, ...extra });
    schedulePeriodic(c.pending > 0);
  }

  /** Records an outcome; delivered by `deliver()` once the status reflects it. */
  function settle(opId: string, outcome: OperationOutcome) {
    if (!waiters.has(opId)) return;
    settlements.push([opId, outcome]);
  }

  function deliver() {
    const batch = settlements;
    settlements = [];
    for (const [opId, outcome] of batch) {
      const list = waiters.get(opId);
      if (!list) continue;
      waiters.delete(opId);
      for (const resolve of list) resolve(outcome);
    }
  }

  function settleAllQueued() {
    for (const opId of [...waiters.keys()]) settle(opId, { status: "queued" });
  }

  function waitFor(opId: string): Promise<OperationOutcome> {
    return new Promise((resolve) => {
      const list = waiters.get(opId) ?? [];
      list.push(resolve);
      waiters.set(opId, list);
    });
  }

  function scheduleRetry() {
    if (retryTimer) clearTimer(retryTimer);
    const delay = backoffDelay(failures, backoff);
    failures += 1;
    const at = now() + delay;
    retryTimer = setTimer(() => {
      retryTimer = null;
      void flush();
    }, delay);
    return at;
  }

  function schedulePeriodic(needed: boolean) {
    if (periodicTimer) {
      clearTimer(periodicTimer);
      periodicTimer = null;
    }
    if (!needed || disposed) return;
    periodicTimer = setTimer(() => {
      periodicTimer = null;
      void flush();
    }, periodicMs);
  }

  async function isKept(visitId: string): Promise<boolean> {
    return (await db.visits.get(visitId))?.kept ?? false;
  }

  /** Handles the answer of one batch. */
  async function handleResults(batch: OutboxEntry[], results: SyncResult[]) {
    const byOp = new Map(results.map((result) => [result.opId, result]));
    const applied = new Set<string>();
    const rejected = new Set<string>();
    for (const entry of batch) {
      const sent = toOperation(entry);
      const result = byOp.get(sent.opId);
      if (!result) continue;
      // A dependant refused right after its dependency: it never had a fair chance, it waits.
      if (result.status === "rejected" && entry.dependsOn.some((dep) => rejected.has(dep))) {
        const blocker = entry.dependsOn.find((dep) => rejected.has(dep))!;
        await db.outbox.update(entry.opId, { status: "blocked", blockedBy: blocker });
        settle(entry.opId, { status: "queued" });
        continue;
      }
      if (result.status === "rejected") rejected.add(entry.opId);
      const fresh = (await db.outbox.get(entry.opId)) ?? entry;
      const outcome = await applySyncResult(db, fresh, result, {
        kept: await isKept(entry.visitId),
        now: new Date(now()).toISOString(),
      });
      if (result.status === "applied") applied.add(entry.visitId);
      if (result.status === "applied" && entry.photo && entry.photo.stage === "confirm") {
        publish({
          recent: [
            ...status.recent,
            { opId: entry.opId, photoId: entry.entityId, label: entry.label },
          ],
        });
      }
      if (result.status === "applied" && entry.photo && result.data.upload) {
        // Not settled yet: the upload and the confirmation follow.
        continue;
      }
      settle(entry.opId, outcome);
      if (result.status === "rejected") {
        // The dependants were just blocked: tell their waiters.
        const blocked = await db.outbox.where("status").equals("blocked").toArray();
        for (const b of blocked)
          if (b.blockedBy === entry.opId) settle(b.opId, { status: "queued" });
      }
    }
    for (const visitId of applied) deps.onApplied?.(visitId);
  }

  /** Uploads the blobs of the photos at the `put` stage (3 at a time). */
  async function uploadPhotos(): Promise<"progress" | "none" | "failed"> {
    const entries = (await db.outbox.toArray())
      .filter((entry) => entry.status === "pending" && entry.photo?.stage === "put")
      .sort((a, b) => a.seq - b.seq);
    if (entries.length === 0) return "none";
    let progressed = false;
    let failed = false;
    const queue = [...entries];
    const worker = async () => {
      while (queue.length > 0 && !disposed) {
        const entry = queue.shift()!;
        const outcome = await uploadOne(entry);
        if (outcome === "progress") progressed = true;
        if (outcome === "failed") failed = true;
      }
    };
    await Promise.all(Array.from({ length: Math.min(uploadConcurrency, entries.length) }, worker));
    return failed ? "failed" : progressed ? "progress" : "none";
  }

  async function uploadOne(entry: OutboxEntry): Promise<"progress" | "failed"> {
    const photo = entry.photo!;
    const upload = photo.upload!;
    const main = await db.blobs.get(blobKeys.photoMain(entry.entityId));
    const thumb = await db.blobs.get(blobKeys.photoThumb(entry.entityId));
    if (!main || !thumb) {
      await db.outbox.update(entry.opId, {
        status: "rejected",
        rejection: {
          code: "not_found",
          message: "Les fichiers de la photo ont disparu de la tablette.",
        },
        lastError: "Fichiers manquants",
      });
      settle(entry.opId, { status: "rejected", code: "not_found", message: "Fichiers manquants" });
      return "progress";
    }
    const total = main.size + thumb.size;
    const controller = new AbortController();
    const parts: Array<[{ url: string; headers: Record<string, string> }, Blob, number]> = [
      [upload.main, main.blob, 0],
      [upload.thumb, thumb.blob, main.size],
    ];
    for (const [target, blob, offset] of parts) {
      let result: { status: number };
      try {
        result = await transport.put(
          target,
          blob,
          (loaded) => {
            const progress = Math.min(100, Math.round(((offset + loaded) / total) * 100));
            void db.outbox.update(entry.opId, { photo: { ...photo, progress } });
          },
          controller.signal,
        );
      } catch {
        await db.outbox.update(entry.opId, {
          attempts: entry.attempts + 1,
          lastError: "Hors connexion : nouvelle tentative…",
        });
        return "failed";
      }
      if (PHOTO_URL_REFUSED.includes(result.status)) {
        // Expired URL: back to the creation, which answers with fresh URLs for the same row.
        await db.outbox.update(entry.opId, {
          photo: { ...photo, stage: "create", upload: null, progress: 0 },
          lastError: null,
        });
        return "progress";
      }
      if (result.status < 200 || result.status >= 300) {
        if (result.status >= 500 || result.status === 429) {
          await db.outbox.update(entry.opId, {
            attempts: entry.attempts + 1,
            lastError: "Le stockage ne répond pas : nouvelle tentative…",
          });
          return "failed";
        }
        await db.outbox.update(entry.opId, {
          status: "rejected",
          rejection: {
            code: "validation",
            message: `Le stockage a refusé le fichier (code ${result.status}).`,
          },
          lastError: `Le stockage a refusé le fichier (code ${result.status}).`,
        });
        settle(entry.opId, {
          status: "rejected",
          code: "validation",
          message: `Le stockage a refusé le fichier (code ${result.status}).`,
        });
        return "progress";
      }
    }
    await db.outbox.update(entry.opId, {
      photo: { ...photo, stage: "confirm", progress: 100 },
      lastError: null,
    });
    return "progress";
  }

  /** Sends what waits; a call during a run joins that run. */
  function flush(): Promise<void> {
    if (disposed || paused) return Promise.resolve();
    if (current) return current;
    current = runFlush().finally(() => {
      current = null;
      // Outcomes reach the screens once the run is over and the status reflects it.
      deliver();
      if (rerun) {
        rerun = false;
        void flush();
      }
    });
    return current;
  }

  async function runFlush(): Promise<void> {
    if (!deps.isOnline()) {
      settleAllQueued();
      await refresh({ message: null, nextRetryAt: null });
      return;
    }
    publish({ state: "syncing" });
    let progressed = true;
    let sawRetry = false;
    let rounds = 0;
    while (progressed && !disposed && rounds < 50) {
      progressed = false;
      rounds += 1;
      const all = (await db.outbox.toArray()).sort((a, b) => a.seq - b.seq);
      const visitIds = [...new Set(all.map((entry) => entry.visitId))];
      for (const visitId of visitIds) {
        const entries = all.filter((entry) => entry.visitId === visitId);
        const batch = selectBatch(entries, all, batchSize);
        if (batch.length === 0) continue;
        for (const entry of batch) await db.outbox.update(entry.opId, { status: "sending" });
        let response;
        try {
          response = await transport.send(batch.map(toOperation));
        } catch (error) {
          for (const entry of batch) {
            await db.outbox.update(entry.opId, { status: "pending", attempts: entry.attempts + 1 });
          }
          await failed(error);
          return;
        }
        failures = 0;
        lastSyncAt = response.serverTime;
        await writeMeta(db, META_KEYS.lastSyncAt, response.serverTime);
        await writeMeta(db, META_KEYS.lastServerContactAt, response.serverTime);
        // A snapshot read before this answer must not undo it (see mergeSnapshot).
        await writeMeta(db, appliedAtKey(visitId), response.serverTime);
        if (response.results.some((result) => result.status === "retry")) sawRetry = true;
        await handleResults(batch, response.results);
        // The screens waiting on this batch learn its outcome now, not at the end of the run.
        await refresh({ message: null, nextRetryAt: null, authReason: null });
        publish({ state: "syncing" });
        deliver();
        progressed = true;
      }
      const uploads = await uploadPhotos();
      if (uploads === "failed") {
        await failed(new TransportError("network", "Hors connexion"));
        return;
      }
      if (uploads === "progress") progressed = true;
      // A `retry` answer is not hammered: the next attempt waits for the backoff.
      if (sawRetry) break;
    }
    settleAllQueued();
    if (sawRetry) {
      const at = scheduleRetry();
      await refresh({
        message: "Le serveur n'a pas pu appliquer une modification : nouvelle tentative…",
        nextRetryAt: at,
        authReason: null,
      });
    } else {
      await refresh({ message: null, nextRetryAt: null, authReason: null });
    }
  }

  async function failed(error: unknown) {
    settleAllQueued();
    if (error instanceof TransportError && error.kind === "auth") {
      const reason = error.reason ?? "signed_out";
      await refresh({
        authReason: reason,
        message:
          reason === "signed_out"
            ? "Session expirée : reconnectez-vous pour envoyer vos modifications."
            : reason === "revoked"
              ? "Vos sessions ont été déconnectées par l'administrateur."
              : "Votre compte a été désactivé.",
        nextRetryAt: null,
      });
      deps.onAuthFailure?.(reason);
      return;
    }
    if (error instanceof TransportError && error.kind === "forbidden") {
      await refresh({
        message: "Votre rôle ne permet pas de modifier les visites.",
        nextRetryAt: null,
      });
      return;
    }
    const at = scheduleRetry();
    const message =
      error instanceof TransportError && error.kind === "http"
        ? "Le serveur ne répond pas : nouvelle tentative…"
        : "Hors connexion : nouvelle tentative…";
    await refresh({ message, nextRetryAt: at });
  }

  /** A flush now, or another one right after the current run (something new was queued). */
  function requestFlush(): void {
    if (current) rerun = true;
    else void flush();
  }

  async function enqueue(operation: NewOperation): Promise<Enqueued> {
    const outcome = await enqueueOperation(db, operation);
    await applyLocally(db, operation.visitId, operation.kind, operation.payload, {
      userId: deps.user.id,
      userName: deps.user.name,
      now: new Date(now()).toISOString(),
    });
    if (outcome.kind === "cancelled") {
      for (const id of outcome.removedOpIds) settle(id, { status: "queued" });
      await refresh();
      deliver();
      return { outcome, wait: async () => ({ status: "applied", data: {} }) };
    }
    const { opId } = outcome.entry;
    const pending = waitFor(opId);
    await refresh();
    if (deps.isOnline() && !paused) requestFlush();
    else {
      settle(opId, { status: "queued" });
      deliver();
    }
    return { outcome, wait: () => pending };
  }

  return {
    enqueue,

    async enqueuePhoto(input) {
      await db.blobs.bulkPut([
        {
          key: blobKeys.photoMain(input.photoId),
          visitId: input.visitId,
          blob: input.main,
          size: input.main.size,
        },
        {
          key: blobKeys.photoThumb(input.photoId),
          visitId: input.visitId,
          blob: input.thumb,
          size: input.thumb.size,
        },
      ]);
      return enqueue({
        visitId: input.visitId,
        kind: "photo.create",
        entityId: input.photoId,
        payload: { id: input.photoId, item: input.item },
        label: `Photo ${input.name}`,
        photo: { stage: "create", name: input.name, progress: 0, upload: null },
      });
    },

    flush,

    onStatus(listener) {
      listeners.add(listener);
      listener(status);
      return () => {
        listeners.delete(listener);
      };
    },

    status: () => status,

    pause() {
      paused = true;
    },

    resume() {
      paused = false;
      void flush();
    },

    async retry(opId) {
      const entry = await db.outbox.get(opId);
      if (!entry) return;
      await db.outbox.update(opId, {
        status: "pending",
        rejection: null,
        lastError: null,
        attempts: 0,
        blockedBy: null,
      });
      await unblock(db, opId);
      failures = 0;
      await refresh();
      void flush();
    },

    async remove(opId) {
      const entry = await db.outbox.get(opId);
      if (!entry) return;
      await db.outbox.delete(opId);
      if (entry.kind === "photo.create") {
        await db.photos.delete(entry.entityId);
        await db.blobs.bulkDelete([
          blobKeys.photoMain(entry.entityId),
          blobKeys.photoThumb(entry.entityId),
        ]);
      }
      settle(opId, { status: "queued" });
      await refresh();
      deliver();
    },

    clearRecent() {
      publish({ recent: [] });
    },

    async resolveConflict(conflict, resolution) {
      await db.conflicts.delete(conflict.id);
      // The operations held back by the conflict now build on the server version.
      const held = await db.outbox
        .filter(
          (entry) =>
            entry.blockedBy === conflict.id && entry.versionScope === conflict.versionScope,
        )
        .toArray();
      for (const entry of held) {
        await db.outbox.update(entry.opId, { baseVersion: conflict.serverVersion });
      }
      await unblock(db, conflict.id);
      let result: Enqueued | null = null;
      if (resolution) result = await enqueue(resolution);
      else await refresh();
      return result;
    },

    start() {
      const online = () => void flush();
      const visibility = () => {
        if (document.visibilityState === "visible") void flush();
      };
      window.addEventListener("online", online);
      window.addEventListener("offline", online);
      document.addEventListener("visibilitychange", visibility);
      void (async () => {
        lastSyncAt = (await readMeta<string>(db, META_KEYS.lastSyncAt)) ?? null;
        // A page closed or reloaded during a send left its operations « sending »: they go
        // back to the queue (sending again is safe, the server knows each opId).
        await db.outbox.where("status").equals("sending").modify({ status: "pending" });
        await refresh();
        void flush();
      })();
      return () => {
        window.removeEventListener("online", online);
        window.removeEventListener("offline", online);
        document.removeEventListener("visibilitychange", visibility);
      };
    },

    dispose() {
      disposed = true;
      if (retryTimer) clearTimer(retryTimer);
      if (periodicTimer) clearTimer(periodicTimer);
      listeners.clear();
      settleAllQueued();
      deliver();
    },
  };
}
