/** A list item with an identity and a last-change timestamp (ISO 8601). */
export interface Versioned {
  id: string;
  updatedAt: string;
}

/**
 * Merges a server snapshot of a list into the list kept by the client. Server responses can
 * arrive out of order (a page change still in flight when a marker is created), so neither
 * side wins blindly. `snapshotAt` is the database time at which the server read the list.
 *
 * - Item on both sides: the most recent `updatedAt` wins (a late, stale answer never
 *   overwrites a newer local change).
 * - Item only known locally: kept only when it changed **after** the snapshot (created or
 *   edited locally, not yet visible to that read). Otherwise the server no longer has it:
 *   it was deleted elsewhere and disappears.
 * - Item only known by the server: added (created elsewhere), unless removed locally.
 * - Item removed locally (`removed`): never comes back.
 *
 * Local order is kept, then new server items follow in server order.
 */
export function mergeSnapshot<T extends Versioned>(
  local: readonly T[],
  server: { items: readonly T[]; snapshotAt: string },
  removed: ReadonlySet<string> = new Set(),
): T[] {
  const snapshot = Date.parse(server.snapshotAt);
  const fromServer = new Map(server.items.map((item) => [item.id, item]));
  const merged: T[] = [];
  const seen = new Set<string>();
  for (const item of local) {
    if (removed.has(item.id)) continue;
    const other = fromServer.get(item.id);
    if (other) {
      merged.push(Date.parse(other.updatedAt) > Date.parse(item.updatedAt) ? other : item);
    } else if (Date.parse(item.updatedAt) > snapshot) {
      merged.push(item);
    }
    seen.add(item.id);
  }
  for (const item of server.items) {
    if (!seen.has(item.id) && !removed.has(item.id)) merged.push(item);
  }
  return merged;
}
