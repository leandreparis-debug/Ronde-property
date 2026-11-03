import type { ProcessedPhoto } from "./process";

/**
 * Upload queue of the Photos tab. Framework-free and unit-tested with fake timers.
 *
 * Lifecycle of an item: `queued` → `processing` (browser compression, 2 at a time) →
 * `preparing` (server creates the pending row and signs two URLs) → `uploading` (two `PUT`,
 * 3 items at a time) → `confirming` (server checks both objects) → `done`. Failures end in
 * `failed` (« Réessayer » re-runs from the failed stage) or `rejected` (unsupported file).
 *
 * The queue lives in memory. Its interface (`enqueue`, `onChange`, `retry`, `remove`) is the
 * contract a persistent, offline queue will implement in phase 2.
 */

export type UploadStatus =
  | "queued"
  | "processing"
  | "preparing"
  | "uploading"
  | "confirming"
  | "done"
  | "failed"
  | "rejected";

export interface UploadItem {
  /** Local identifier, stable for the life of the queue. */
  localId: string;
  name: string;
  zoneKey: string | null;
  status: UploadStatus;
  /** 0 to 100 while uploading. */
  progress: number;
  /** Object URL of the local thumbnail, once processed. */
  previewUrl: string | null;
  /** Message of a `failed` or `rejected` item. */
  error: string | null;
  /** Server identifier once prepared. */
  photoId: string | null;
  /** Attempts of the current stage (resets on « Réessayer »). */
  attempts: number;
}

/** Signed upload URL and headers of one object. */
export interface UploadTarget {
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

/** Answer of the server for one prepared photo. */
export interface PreparedUpload {
  photoId: string;
  main: UploadTarget;
  thumb: UploadTarget;
}

/** What the server needs to create the pending row. */
export interface PrepareInput {
  originalFilename: string | null;
  width: number;
  height: number;
  sizeBytes: number;
  thumbSizeBytes: number;
  takenAt: string | null;
  zoneKey: string | null;
}

export type PutResult = { status: number };

export interface ConfirmOutcome {
  ok: boolean;
  error?: string;
  /** False when a retry cannot help (visit completed, photo removed). */
  retryable?: boolean;
}

export interface UploadQueueDeps {
  process: (file: Blob, filename: string | null) => Promise<ProcessedPhoto>;
  /** Creates the pending rows and signs the URLs. Throws when offline. */
  prepare: (items: PrepareInput[]) => Promise<PreparedUpload[] | { error: string }>;
  /** Signs new URLs for an already prepared photo (expired URL). */
  renew: (photoId: string) => Promise<PreparedUpload | { error: string }>;
  /** `PUT` of one object; resolves with the HTTP status, rejects on network failure. */
  put: (
    target: UploadTarget,
    body: Blob,
    onProgress: (loaded: number, total: number) => void,
    signal: AbortSignal,
  ) => Promise<PutResult>;
  confirm: (photoId: string) => Promise<ConfirmOutcome>;
  /** Best-effort removal of a pending row when the user removes an item (optional). */
  discard?: (photoId: string) => Promise<void>;
  /** Called after every successful confirmation. */
  onUploaded?: (photoId: string) => void;
  /** Object URL factory, replaceable in tests. */
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  /** Milliseconds before each retry of an upload (default 1 s, 3 s, 10 s). */
  retryDelaysMs?: number[];
  /** Parallel uploads (default 3). */
  uploadConcurrency?: number;
}

export interface UploadQueue {
  enqueue(files: Array<{ file: Blob; name: string }>, options?: { zoneKey?: string | null }): void;
  /** Subscribes to every change; returns the unsubscribe function. */
  onChange(listener: (items: UploadItem[]) => void): () => void;
  items(): UploadItem[];
  /** Runs a `failed` item again from its failed stage. */
  retry(localId: string): void;
  /** Removes an item; an upload in flight is aborted. */
  remove(localId: string): void;
  /** Removes the `done` items. */
  clearDone(): void;
  /** True while an item is neither done nor rejected nor failed (the page must stay open). */
  hasActive(): boolean;
  dispose(): void;
}

interface Internal {
  item: UploadItem;
  file: Blob;
  processed: ProcessedPhoto | null;
  prepared: PreparedUpload | null;
  controller: AbortController | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  removed: boolean;
}

const DEFAULT_RETRY_DELAYS = [1_000, 3_000, 10_000];

/** Read through a function so that TypeScript does not narrow the status across awaits. */
function hasFailed(entry: Internal): boolean {
  return entry.item.status === "failed";
}

/** HTTP statuses meaning the signed URL is no longer usable: ask for a new one. */
function urlRefused(status: number): boolean {
  return status === 400 || status === 401 || status === 403 || status === 410;
}

/** True for a status worth retrying as is (5xx, 429). */
function transient(status: number): boolean {
  return status >= 500 || status === 429;
}

/** Creates the upload queue. See the module documentation for the lifecycle. */
export function createUploadQueue(deps: UploadQueueDeps): UploadQueue {
  const retryDelays = deps.retryDelaysMs ?? DEFAULT_RETRY_DELAYS;
  const uploadConcurrency = deps.uploadConcurrency ?? 3;
  const createObjectUrl = deps.createObjectUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectUrl = deps.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url));

  const entries: Internal[] = [];
  const listeners = new Set<(items: UploadItem[]) => void>();
  let nextId = 1;
  let processing = 0;
  let uploading = 0;
  let disposed = false;

  function snapshot(): UploadItem[] {
    return entries.map((entry) => ({ ...entry.item }));
  }

  function notify() {
    if (disposed) return;
    const items = snapshot();
    for (const listener of listeners) listener(items);
  }

  function set(entry: Internal, patch: Partial<UploadItem>) {
    Object.assign(entry.item, patch);
    notify();
  }

  function fail(entry: Internal, message: string) {
    set(entry, { status: "failed", error: message, progress: 0 });
  }

  /** Pumps the two limited stages: processing (2 slots) and uploading (3 slots). */
  function pump() {
    if (disposed) return;
    for (const entry of entries) {
      if (processing >= 2) break;
      if (entry.item.status === "queued" && !entry.removed) {
        processing += 1;
        void runProcessing(entry).finally(() => {
          processing -= 1;
          pump();
        });
      }
    }
    for (const entry of entries) {
      if (uploading >= uploadConcurrency) break;
      if (
        entry.item.status === "preparing" &&
        entry.processed &&
        !entry.removed &&
        !entry.controller &&
        !entry.retryTimer
      ) {
        uploading += 1;
        void runUpload(entry).finally(() => {
          uploading -= 1;
          pump();
        });
      }
    }
  }

  async function runProcessing(entry: Internal) {
    set(entry, { status: "processing", error: null });
    try {
      const processed = await deps.process(entry.file, entry.item.name);
      if (entry.removed) return;
      entry.processed = processed;
      set(entry, { status: "preparing", previewUrl: createObjectUrl(processed.thumb) });
    } catch (error) {
      if (entry.removed) return;
      set(entry, {
        status: "rejected",
        error: error instanceof Error ? error.message : "Impossible de préparer l'image.",
      });
    }
  }

  async function prepareEntry(entry: Internal): Promise<boolean> {
    if (entry.prepared) return true;
    const processed = entry.processed!;
    let result: PreparedUpload[] | { error: string };
    try {
      result = await deps.prepare([
        {
          originalFilename: processed.originalFilename,
          width: processed.width,
          height: processed.height,
          sizeBytes: processed.main.size,
          thumbSizeBytes: processed.thumb.size,
          takenAt: processed.takenAt,
          zoneKey: entry.item.zoneKey,
        },
      ]);
    } catch {
      return scheduleRetry(entry, "Hors connexion : nouvelle tentative…");
    }
    if ("error" in result) {
      fail(entry, result.error);
      return false;
    }
    const prepared = result[0];
    if (!prepared) {
      fail(entry, "Réponse du serveur incomplète.");
      return false;
    }
    entry.prepared = prepared;
    set(entry, { photoId: prepared.photoId });
    return true;
  }

  /** Schedules the next attempt of the upload stage, or fails after the last delay. */
  function scheduleRetry(entry: Internal, message: string): false {
    const delay = retryDelays[entry.item.attempts];
    entry.item.attempts += 1;
    if (delay === undefined) {
      fail(entry, "Échec de l'envoi après plusieurs tentatives.");
      return false;
    }
    set(entry, { status: "preparing", progress: 0, error: message });
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = null;
      pump();
    }, delay);
    // Not an active upload while waiting: free the slot.
    return false;
  }

  async function putObject(
    entry: Internal,
    target: UploadTarget,
    body: Blob,
    weight: { offset: number; share: number },
  ): Promise<"ok" | "renew" | "retry"> {
    const controller = entry.controller!;
    try {
      const { status } = await deps.put(
        target,
        body,
        (loaded, total) => {
          const fraction = total > 0 ? loaded / total : 0;
          set(entry, {
            progress: Math.min(100, Math.round((weight.offset + fraction * weight.share) * 100)),
          });
        },
        controller.signal,
      );
      if (status >= 200 && status < 300) return "ok";
      if (urlRefused(status)) return "renew";
      if (transient(status)) return "retry";
      fail(entry, `Le stockage a refusé le fichier (code ${status}).`);
      return "retry";
    } catch {
      return "retry";
    }
  }

  async function runUpload(entry: Internal) {
    entry.controller = new AbortController();
    try {
      if (!(await prepareEntry(entry))) return;
      if (entry.removed) return;
      set(entry, { status: "uploading", progress: 0, error: null });
      const processed = entry.processed!;
      let prepared = entry.prepared!;
      const total = processed.main.size + processed.thumb.size;
      const mainShare = total > 0 ? processed.main.size / total : 0.5;

      for (const [index, part] of (
        [
          ["main", processed.main, { offset: 0, share: mainShare }],
          ["thumb", processed.thumb, { offset: mainShare, share: 1 - mainShare }],
        ] as const
      ).entries()) {
        const [key, blob, weight] = part;
        let outcome = await putObject(entry, prepared[key], blob, weight);
        if (entry.removed || hasFailed(entry)) return;
        if (outcome === "renew") {
          let renewed: PreparedUpload | { error: string };
          try {
            renewed = await deps.renew(prepared.photoId);
          } catch {
            scheduleRetry(entry, "Hors connexion : nouvelle tentative…");
            return;
          }
          if ("error" in renewed) {
            fail(entry, renewed.error);
            return;
          }
          prepared = renewed;
          entry.prepared = renewed;
          outcome = await putObject(entry, prepared[key], blob, weight);
          if (entry.removed || hasFailed(entry)) return;
        }
        if (outcome !== "ok") {
          scheduleRetry(entry, "Hors connexion : nouvelle tentative…");
          return;
        }
        if (index === 0) set(entry, { progress: Math.round(mainShare * 100) });
      }

      set(entry, { status: "confirming", progress: 100 });
      let confirmed: ConfirmOutcome;
      try {
        confirmed = await deps.confirm(prepared.photoId);
      } catch {
        scheduleRetry(entry, "Hors connexion : nouvelle tentative…");
        return;
      }
      if (entry.removed) return;
      if (!confirmed.ok) {
        if (confirmed.retryable) {
          scheduleRetry(entry, confirmed.error ?? "Nouvelle tentative…");
        } else {
          fail(entry, confirmed.error ?? "La photo n'a pas pu être confirmée.");
        }
        return;
      }
      set(entry, { status: "done", error: null, attempts: 0 });
      deps.onUploaded?.(prepared.photoId);
    } finally {
      entry.controller = null;
    }
  }

  function find(localId: string): Internal | undefined {
    return entries.find((entry) => entry.item.localId === localId);
  }

  return {
    enqueue(files, options) {
      if (disposed) return;
      for (const { file, name } of files) {
        entries.push({
          item: {
            localId: `upload-${nextId++}`,
            name,
            zoneKey: options?.zoneKey ?? null,
            status: "queued",
            progress: 0,
            previewUrl: null,
            error: null,
            photoId: null,
            attempts: 0,
          },
          file,
          processed: null,
          prepared: null,
          controller: null,
          retryTimer: null,
          removed: false,
        });
      }
      notify();
      pump();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    items: snapshot,
    retry(localId) {
      const entry = find(localId);
      if (!entry || entry.item.status !== "failed") return;
      entry.item.attempts = 0;
      if (!entry.processed) {
        set(entry, { status: "queued", error: null, progress: 0 });
      } else {
        set(entry, { status: "preparing", error: null, progress: 0 });
      }
      pump();
    },
    remove(localId) {
      const index = entries.findIndex((entry) => entry.item.localId === localId);
      if (index === -1) return;
      const entry = entries[index]!;
      entry.removed = true;
      entry.controller?.abort();
      if (entry.retryTimer) clearTimeout(entry.retryTimer);
      if (entry.item.previewUrl) revokeObjectUrl(entry.item.previewUrl);
      if (entry.prepared && entry.item.status !== "done") {
        void deps.discard?.(entry.prepared.photoId).catch(() => undefined);
      }
      entries.splice(index, 1);
      notify();
      pump();
    },
    clearDone() {
      for (const entry of [...entries]) {
        if (entry.item.status === "done") {
          if (entry.item.previewUrl) revokeObjectUrl(entry.item.previewUrl);
          entries.splice(entries.indexOf(entry), 1);
        }
      }
      notify();
    },
    hasActive() {
      return entries.some((entry) => !["done", "rejected", "failed"].includes(entry.item.status));
    },
    dispose() {
      disposed = true;
      for (const entry of entries) {
        entry.controller?.abort();
        if (entry.retryTimer) clearTimeout(entry.retryTimer);
        if (entry.item.previewUrl) revokeObjectUrl(entry.item.previewUrl);
      }
      entries.length = 0;
      listeners.clear();
    },
  };
}

/** French label of a status for the queue panel. */
export function uploadStatusLabel(item: UploadItem): string {
  switch (item.status) {
    case "queued":
    case "processing":
    case "preparing":
      return item.error ?? "Préparation";
    case "uploading":
      return `Envoi ${item.progress} %`;
    case "confirming":
      return "Vérification";
    case "done":
      return "Terminé";
    case "failed":
      return `Échec : ${item.error ?? "erreur inconnue"}`;
    case "rejected":
      return item.error ?? "Fichier refusé";
  }
}
