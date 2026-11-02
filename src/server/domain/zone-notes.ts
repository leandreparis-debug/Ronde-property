/** Serialisable zone note, as sent to the client components (dates as ISO strings). */
export interface ZoneNoteView {
  id: string;
  zoneKey: string;
  zoneLabel: string;
  sortOrder: number;
  content: string;
  /** Version of the note (content changes only). */
  version: number;
  updatedAt: string;
  updatedBy: string | null;
  updatedByName: string | null;
}

/** Converts a repository record (with `Date`) into its serialisable form. */
export function toZoneNoteView(
  note: Omit<ZoneNoteView, "updatedAt"> & { updatedAt: Date },
): ZoneNoteView {
  return {
    id: note.id,
    zoneKey: note.zoneKey,
    zoneLabel: note.zoneLabel,
    sortOrder: note.sortOrder,
    content: note.content,
    version: note.version,
    updatedAt: note.updatedAt.toISOString(),
    updatedBy: note.updatedBy,
    updatedByName: note.updatedByName,
  };
}
