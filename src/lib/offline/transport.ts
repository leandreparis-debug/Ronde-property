import { putWithProgress, type PutResult, type PutTarget } from "@/lib/upload/put";

import type { SyncAuthFailure, SyncOperation, SyncResponse } from "./ops";

/** Why a call to the server failed, as the engine needs to know it. */
export class TransportError extends Error {
  readonly kind: "network" | "auth" | "forbidden" | "http";
  readonly reason: SyncAuthFailure | null;
  readonly status: number | null;

  constructor(
    kind: TransportError["kind"],
    message: string,
    options: { reason?: SyncAuthFailure; status?: number } = {},
  ) {
    super(message);
    this.name = "TransportError";
    this.kind = kind;
    this.reason = options.reason ?? null;
    this.status = options.status ?? null;
  }
}

/** How the engine reaches the server; replaced by fakes in the tests. */
export interface SyncTransport {
  /** `POST /api/sync`. Rejects with a `TransportError`. */
  send(ops: SyncOperation[]): Promise<SyncResponse>;
  /** Direct `PUT` of a blob to a signed URL; resolves with the status, rejects on network failure. */
  put(
    target: PutTarget,
    body: Blob,
    onProgress: (loaded: number, total: number) => void,
    signal: AbortSignal,
  ): Promise<PutResult>;
}

const AUTH_REASONS: SyncAuthFailure[] = ["signed_out", "revoked", "inactive"];

/** Transport of the browser: same-origin `fetch` with the session cookie. */
export function createFetchTransport(fetchImpl: typeof fetch = fetch): SyncTransport {
  return {
    async send(ops) {
      let response: Response;
      try {
        response = await fetchImpl("/api/sync", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ops }),
        });
      } catch {
        throw new TransportError("network", "Hors connexion");
      }
      if (response.status === 401) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        const reason = AUTH_REASONS.includes(body.error as SyncAuthFailure)
          ? (body.error as SyncAuthFailure)
          : "signed_out";
        throw new TransportError("auth", "Session expirée", { reason, status: 401 });
      }
      if (response.status === 403) {
        throw new TransportError("forbidden", "Droit refusé", { status: 403 });
      }
      if (!response.ok) {
        throw new TransportError("http", `Le serveur a répondu ${response.status}`, {
          status: response.status,
        });
      }
      return (await response.json()) as SyncResponse;
    },
    put: putWithProgress,
  };
}
