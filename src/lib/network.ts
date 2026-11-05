/** Message shown when a server action cannot reach the server (no network). */
export const OFFLINE_ERROR =
  "Hors connexion : votre saisie est conservée. Réessayez au retour du réseau.";

/** Result standing for a server action that never reached the server. */
export interface Unreachable {
  ok: false;
  error: string;
  offline: true;
}

/**
 * Calls a server action and turns a network failure (the promise rejects: no network, server
 * unreachable) into an ordinary failed result, so that a form keeps its input and shows a
 * message instead of staying stuck on « Enregistrement… ».
 */
export async function reachServer<T>(call: () => Promise<T>): Promise<T | Unreachable> {
  try {
    return await call();
  } catch {
    return { ok: false, error: OFFLINE_ERROR, offline: true };
  }
}
