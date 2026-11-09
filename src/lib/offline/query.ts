/**
 * Replaces the query of the current URL without a server round trip (`history.replaceState`,
 * which Next.js keeps in sync with `useSearchParams`). The visit screens read everything from
 * the local store: changing a tab, a zone or a filter must work without network.
 */
export function replaceQuery(params: URLSearchParams | string): void {
  const query = typeof params === "string" ? params : params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
  window.history.replaceState(window.history.state, "", url);
}
