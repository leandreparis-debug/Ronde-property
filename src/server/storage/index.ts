import "server-only";

import path from "node:path";

import { env } from "@/lib/env";

import { LocalStorageService } from "./local";
import { SupabaseStorageService } from "./supabase";
import type { StorageService } from "./types";

export * from "./object-path";
export * from "./types";

let instance: StorageService | undefined;

/**
 * The storage service selected by `STORAGE_PROVIDER` (`supabase` by default, `local` for
 * tests and development only, see env.ts). Built once per process.
 */
export function getStorageService(): StorageService {
  if (instance) return instance;
  if (env.STORAGE_PROVIDER === "local") {
    instance = new LocalStorageService({
      dir: path.resolve(process.cwd(), env.LOCAL_STORAGE_DIR),
      // Guaranteed by the cross validation of env.ts.
      secret: env.LOCAL_STORAGE_SECRET ?? "",
    });
    return instance;
  }
  // The Supabase configuration is only read here, when the first service is built.
  instance = new SupabaseStorageService();
  return instance;
}

/** The local service, only when `STORAGE_PROVIDER=local`; used by the local route. */
export function getLocalStorageService(): LocalStorageService | null {
  if (env.STORAGE_PROVIDER !== "local") return null;
  const service = getStorageService();
  return service instanceof LocalStorageService ? service : null;
}
