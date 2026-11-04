/** A list item with an identity and a last-change timestamp (ISO 8601). */
export interface Versioned {
  id: string;
  updatedAt: string;
}

/**
 * Merges the list rendered by the server into the list kept by the client. Server responses
 * can arrive out of order (a page change still in flight when a marker is created), so the
 * server list never replaces the local one blindly:
 * - for an item present on both sides, the most recent `updatedAt` wins;
 * - an item only known locally is kept (just created, the server answer predates it);
 * - an item removed locally (`removed`) never comes back;
 * - an item only known by the server is added (created elsewhere).
 * Local order is kept, then new server items follow in server order.
 */
export function mergeByVersion<T extends Versioned>(
  local: readonly T[],
  server: readonly T[],
  removed: ReadonlySet<string> = new Set(),
): T[] {
  const fromServer = new Map(server.map((item) => [item.id, item]));
  const merged: T[] = [];
  const seen = new Set<string>();
  for (const item of local) {
    if (removed.has(item.id)) continue;
    const other = fromServer.get(item.id);
    merged.push(other && Date.parse(other.updatedAt) > Date.parse(item.updatedAt) ? other : item);
    seen.add(item.id);
  }
  for (const item of server) {
    if (!seen.has(item.id) && !removed.has(item.id)) merged.push(item);
  }
  return merged;
}
