import { env } from "@/lib/env";

/** Public Supabase settings, checked when a client is created rather than at import. */
export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

/**
 * Returns the public Supabase URL and anon key, or throws an explicit error when the
 * variables are missing. Called by the client factories, never at module load, so the
 * application still builds and runs without Supabase (steps 1 and 2).
 */
export function requireSupabasePublicConfig(): SupabasePublicConfig {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase n'est pas configuré : renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY dans .env.local (voir docs/supabase-setup.md).",
    );
  }
  return { url, anonKey };
}

/** Returns the service role key, or throws. Server only. */
export function requireSupabaseServiceRoleKey(): string {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY est absente : elle est requise côté serveur pour les opérations d'administration (voir docs/supabase-setup.md).",
    );
  }
  return key;
}
