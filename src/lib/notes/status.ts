/** What the status line of a zone shows. */
export type NoteSaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  /** The change waits in the outbox: the server is unreachable (`attempt` > 0) or the device is offline. */
  | { kind: "offline"; attempt: number; deviceOffline?: boolean }
  | { kind: "error"; message: string };

/** Current state of a note on the server, when a save was refused for a stale version. */
export interface NoteConflict {
  content: string;
  version: number;
  updatedAt: string;
  updatedByName: string | null;
}
