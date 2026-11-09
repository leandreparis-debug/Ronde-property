/**
 * Replaces the query of the current URL without a server round trip (`history.replaceState`,
 * which Next.js keeps in sync with `useSearchParams`). The visit screens read everything from
 * the local store: changing a tab, a zone or a filter must work without network.
 */
export function replaceQuery(params: URLSearchParams | string): void {
  const query = typeof params === "string" ? params : params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
  // `null`, never `history.state`: Next.js only syncs its router (and `useSearchParams`) when
  // the state is not its own (`__NA`), and copies its internal state itself.
  window.history.replaceState(null, "", url);
}
