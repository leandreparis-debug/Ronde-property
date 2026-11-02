import { retryDelayMs } from "./format";

/** What the status line of a zone shows. */
export type NoteSaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "offline"; attempt: number }
  | { kind: "error"; message: string };

/** Current state of a note when a save is refused for a stale version. */
export interface NoteConflict {
  content: string;
  version: number;
  updatedAt: string;
  updatedByName: string | null;
}

/** Outcome of one save call, as returned by the server action. */
export type NoteSaveOutcome =
  | { ok: true; version: number; savedAt: string }
  | { ok: false; error: string; conflict?: NoteConflict; retryable?: boolean };

export interface NoteSaverDeps {
  /** Performs the save. A thrown error means the request never reached the server (offline). */
  save: (noteId: string, version: number, content: string) => Promise<NoteSaveOutcome>;
  /** Version of the note known by the caller (advanced on every success). */
  getVersion: (noteId: string) => number;
  onSaved: (noteId: string, version: number, savedAt: string, content: string) => void;
  onConflict: (noteId: string, mine: string, theirs: NoteConflict) => void;
  onStatus: (noteId: string, status: NoteSaveStatus) => void;
  /** Milliseconds after the last change before saving (800 by default). */
  debounceMs?: number;
}

interface NoteState {
  content: string;
  lastSaved: string;
  timer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  /** Content changed while a save was in flight: save again once it returns. */
  dirtyWhileSaving: boolean;
  attempt: number;
  /** Save refused for a stale version: wait for the user's decision. */
  blocked: boolean;
}

/** Debounced per-zone autosave with automatic retries. Framework-free, unit-testable. */
export interface NoteSaver {
  /** Registers the saved content of a note (initial load, or « Prendre la sienne »). */
  track(noteId: string, savedContent: string): void;
  /** The editor changed: save 800 ms after the last change. */
  change(noteId: string, content: string): void;
  /** Saves now (blur, zone switch). */
  flush(noteId: string): void;
  /** Saves every pending note now (page hidden). */
  flushAll(): void;
  /** After a conflict resolved by « Garder ma version »: saves on the new version. */
  retry(noteId: string): void;
  /** Whether a note still has unsaved changes or a save in flight. */
  hasPending(): boolean;
  pendingIds(): string[];
  dispose(): void;
}

/**
 * Creates the autosave engine shared by the zones of a visit. Nothing is ever dropped: the
 * latest text stays in `content` until the server confirms it, and a failed request is
 * retried after 1 s, 2 s, 5 s, 10 s, then every 30 s.
 */
export function createNoteSaver(deps: NoteSaverDeps): NoteSaver {
  const debounceMs = deps.debounceMs ?? 800;
  const notes = new Map<string, NoteState>();
  let disposed = false;

  function state(noteId: string): NoteState {
    let current = notes.get(noteId);
    if (!current) {
      current = {
        content: "",
        lastSaved: "",
        timer: null,
        retryTimer: null,
        inFlight: false,
        dirtyWhileSaving: false,
        attempt: 0,
        blocked: false,
      };
      notes.set(noteId, current);
    }
    return current;
  }

  function clearTimers(note: NoteState) {
    if (note.timer) clearTimeout(note.timer);
    if (note.retryTimer) clearTimeout(note.retryTimer);
    note.timer = null;
    note.retryTimer = null;
  }

  async function run(noteId: string): Promise<void> {
    const note = state(noteId);
    clearTimers(note);
    if (disposed || note.blocked) return;
    // Nothing new to save: keep the last status visible (« Enregistré à … »).
    if (note.content === note.lastSaved) return;
    if (note.inFlight) {
      note.dirtyWhileSaving = true;
      return;
    }
    note.inFlight = true;
    note.dirtyWhileSaving = false;
    const content = note.content;
    deps.onStatus(noteId, { kind: "saving" });
    let outcome: NoteSaveOutcome;
    try {
      outcome = await deps.save(noteId, deps.getVersion(noteId), content);
    } catch {
      outcome = { ok: false, error: "Hors connexion", retryable: true };
    }
    note.inFlight = false;
    if (disposed) return;

    if (outcome.ok) {
      note.lastSaved = content;
      note.attempt = 0;
      deps.onSaved(noteId, outcome.version, outcome.savedAt, content);
      deps.onStatus(noteId, { kind: "saved", at: outcome.savedAt });
      if (note.dirtyWhileSaving || note.content !== content) void run(noteId);
      return;
    }
    if (outcome.conflict) {
      note.blocked = true;
      note.attempt = 0;
      deps.onStatus(noteId, { kind: "idle" });
      deps.onConflict(noteId, note.content, outcome.conflict);
      return;
    }
    if (outcome.retryable) {
      const delay = retryDelayMs(note.attempt);
      note.attempt += 1;
      deps.onStatus(noteId, { kind: "offline", attempt: note.attempt });
      note.retryTimer = setTimeout(() => void run(noteId), delay);
      return;
    }
    note.attempt = 0;
    deps.onStatus(noteId, { kind: "error", message: outcome.error });
  }

  return {
    track(noteId, savedContent) {
      const note = state(noteId);
      note.content = savedContent;
      note.lastSaved = savedContent;
      note.blocked = false;
      note.attempt = 0;
      clearTimers(note);
    },
    change(noteId, content) {
      const note = state(noteId);
      note.content = content;
      if (note.timer) clearTimeout(note.timer);
      note.timer = setTimeout(() => void run(noteId), debounceMs);
    },
    flush(noteId) {
      void run(noteId);
    },
    flushAll() {
      for (const id of notes.keys()) void run(id);
    },
    retry(noteId) {
      const note = state(noteId);
      note.blocked = false;
      note.attempt = 0;
      void run(noteId);
    },
    hasPending() {
      return this.pendingIds().length > 0;
    },
    pendingIds() {
      return [...notes.entries()]
        .filter(([, note]) => note.inFlight || note.content !== note.lastSaved)
        .map(([id]) => id);
    },
    dispose() {
      disposed = true;
      for (const note of notes.values()) clearTimers(note);
    },
  };
}
