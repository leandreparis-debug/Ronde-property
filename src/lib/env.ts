import { z } from "zod";

/**
 * Environment variables, validated once at startup.
 *
 * Supabase variables stay optional (steps 1 and 2 run without them); the factories that
 * need them fail at call time with an explicit message. `DATABASE_URL` is required at call
 * time by the data layer. `AUTH_PROVIDER=local` and `STORAGE_PROVIDER=local` are validated
 * here, at startup, because they must never be enabled by accident on Vercel or against a
 * remote database.
 */
const optionalUrl = z
  .union([z.literal(""), z.url({ protocol: /^https?$/ })])
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const optionalSecret = z
  .union([z.literal(""), z.string().min(20)])
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const optionalDatabaseUrl = z
  .union([z.literal(""), z.url({ protocol: /^postgres(ql)?$/ })])
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const optionalFlag = z
  .union([z.literal(""), z.enum(["true", "false", "1", "0"])])
  .optional()
  .transform((value) => value === "true" || value === "1");

export const AUTH_PROVIDERS = ["supabase", "local"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const STORAGE_PROVIDERS = ["supabase", "local"] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

/** Default folder of the local storage provider (ignored by git). */
export const DEFAULT_LOCAL_STORAGE_DIR = ".storage";

const optionalLongSecret = z
  .union([z.literal(""), z.string().min(32, "32 caractères minimum.")])
  .optional()
  .transform((value) => (value === "" ? undefined : value));

/** Hosts accepted for the local database (tests, development, local auth). */
export const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True when the connection string points to a local PostgreSQL. */
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return LOCAL_DB_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    NEXT_PUBLIC_APP_NAME: z.string().trim().min(1).default("RONDE"),
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalSecret,
    SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
    DATABASE_URL: optionalDatabaseUrl,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
    AUTH_PROVIDER: z
      .union([z.literal(""), z.enum(AUTH_PROVIDERS)])
      .optional()
      .transform((value): AuthProvider => (value ? value : "supabase")),
    ALLOW_LOCAL_AUTH: optionalFlag,
    LOCAL_AUTH_SECRET: optionalLongSecret,
    STORAGE_PROVIDER: z
      .union([z.literal(""), z.enum(STORAGE_PROVIDERS)])
      .optional()
      .transform((value): StorageProvider => (value ? value : "supabase")),
    ALLOW_LOCAL_STORAGE: optionalFlag,
    LOCAL_STORAGE_SECRET: optionalLongSecret,
    LOCAL_STORAGE_DIR: z
      .union([z.literal(""), z.string().trim().min(1)])
      .optional()
      .transform((value) => (value ? value : DEFAULT_LOCAL_STORAGE_DIR)),
    /** Set by Vercel on every deployment. Local auth and local storage are forbidden there. */
    VERCEL: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.STORAGE_PROVIDER === "local") {
      if (!value.ALLOW_LOCAL_STORAGE) {
        ctx.addIssue({
          code: "custom",
          path: ["ALLOW_LOCAL_STORAGE"],
          message: "STORAGE_PROVIDER=local exige ALLOW_LOCAL_STORAGE=true.",
        });
      }
      if (!value.LOCAL_STORAGE_SECRET) {
        ctx.addIssue({
          code: "custom",
          path: ["LOCAL_STORAGE_SECRET"],
          message: "STORAGE_PROVIDER=local exige LOCAL_STORAGE_SECRET (32 caractères minimum).",
        });
      }
      if (value.VERCEL !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["STORAGE_PROVIDER"],
          message: "STORAGE_PROVIDER=local est interdit sur Vercel.",
        });
      }
      if (!isLocalDatabaseUrl(value.DATABASE_URL)) {
        ctx.addIssue({
          code: "custom",
          path: ["DATABASE_URL"],
          message:
            "STORAGE_PROVIDER=local exige une DATABASE_URL sur localhost ou 127.0.0.1 (base distante interdite).",
        });
      }
    }
    if (value.AUTH_PROVIDER !== "local") return;
    if (!value.ALLOW_LOCAL_AUTH) {
      ctx.addIssue({
        code: "custom",
        path: ["ALLOW_LOCAL_AUTH"],
        message: "AUTH_PROVIDER=local exige ALLOW_LOCAL_AUTH=true.",
      });
    }
    if (!value.LOCAL_AUTH_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["LOCAL_AUTH_SECRET"],
        message: "AUTH_PROVIDER=local exige LOCAL_AUTH_SECRET (32 caractères minimum).",
      });
    }
    if (value.VERCEL !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_PROVIDER"],
        message: "AUTH_PROVIDER=local est interdit sur Vercel.",
      });
    }
    if (!isLocalDatabaseUrl(value.DATABASE_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message:
          "AUTH_PROVIDER=local exige une DATABASE_URL sur localhost ou 127.0.0.1 (base distante interdite).",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Raised when a variable is present but malformed, or when the combination is unsafe. */
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
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
  AUTH_PROVIDER: process.env.AUTH_PROVIDER,
  ALLOW_LOCAL_AUTH: process.env.ALLOW_LOCAL_AUTH,
  LOCAL_AUTH_SECRET: process.env.LOCAL_AUTH_SECRET,
  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
  ALLOW_LOCAL_STORAGE: process.env.ALLOW_LOCAL_STORAGE,
  LOCAL_STORAGE_SECRET: process.env.LOCAL_STORAGE_SECRET,
  LOCAL_STORAGE_DIR: process.env.LOCAL_STORAGE_DIR,
  VERCEL: process.env.VERCEL,
});

/** Returns `DATABASE_URL`, or throws an explicit error when it is missing. */
export function requireDatabaseUrl(): string {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL est absente : renseignez la chaîne de connexion Postgres dans .env.local (voir docs/supabase-setup.md).",
    );
  }
  return env.DATABASE_URL;
}
