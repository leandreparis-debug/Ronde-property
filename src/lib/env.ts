import { z } from "zod";

/**
 * Environment variables, validated once at startup.
 *
 * Supabase variables are optional at step 1 and become required at step 2.
 * A missing optional variable is accepted; a present but malformed one fails
 * with an explicit message so misconfiguration is caught immediately.
 */
const optionalUrl = z
  .union([z.literal(""), z.url({ protocol: /^https?$/ })])
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const optionalSecret = z
  .union([z.literal(""), z.string().min(20)])
  .optional()
  .transform((value) => (value === "" ? undefined : value));

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_NAME: z.string().trim().min(1).default("RONDE"),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalSecret,
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
});

export type Env = z.infer<typeof envSchema>;

/** Raised when a variable is present but malformed. */
export class EnvValidationError extends Error {
  constructor(public readonly issues: ReadonlyArray<{ path: string; message: string }>) {
    const details = issues.map((issue) => `  - ${issue.path}: ${issue.message}`).join("\n");
    super(`Variables d'environnement invalides :\n${details}\nVoir .env.example.`);
    this.name = "EnvValidationError";
  }
}

/**
 * Validates a raw environment object. Exported for tests; the application uses `env`.
 *
 * @throws {EnvValidationError} when a variable is present but invalid.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;
  throw new EnvValidationError(
    result.error.issues.map((issue) => ({
      path: issue.path.map(String).join(".") || "(racine)",
      message: issue.message,
    })),
  );
}

/**
 * Validated environment. `NEXT_PUBLIC_*` variables are listed explicitly so that
 * Next.js can inline them in the browser bundle.
 */
export const env: Env = parseEnv({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
});
