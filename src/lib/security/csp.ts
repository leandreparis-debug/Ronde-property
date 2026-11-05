/**
 * Content Security Policy of the pages, built per request by the middleware with a fresh
 * nonce: Next.js puts it on its own scripts, so no inline script runs without it.
 */
export interface CspOptions {
  /** Base64 nonce of the request. */
  nonce: string;
  /** `NEXT_PUBLIC_SUPABASE_URL`: its origin is allowed for API calls and images. */
  supabaseUrl?: string;
  /** Development server: React Refresh needs `eval` and a WebSocket. */
  dev?: boolean;
}

/** Origin of a URL, or null when it is missing or invalid. */
export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Directives:
 * - scripts: same origin and the nonce, `strict-dynamic` for the chunks Next.js loads;
 * - styles: `unsafe-inline`, required by `style` attributes (React) and next/font; styles
 *   cannot run code;
 * - images: same origin, `blob:` (local previews of photos and plans), `data:`, Supabase;
 * - connections: same origin and Supabase (signed uploads, auth), nothing else;
 * - workers: same origin and `blob:` (photos, plans, report);
 * - no plugin, no framing (`frame-ancestors 'none'`), forms and `<base>` on the same origin.
 *
 * No `upgrade-insecure-requests`: HTTPS is enforced by HSTS (next.config.ts), and the e2e
 * server runs over plain HTTP on 127.0.0.1.
 */
export function buildCsp({ nonce, supabaseUrl, dev = false }: CspOptions): string {
  const supabase = originOf(supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : null;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:", ...(supabase ? [supabase] : [])],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      ...(supabase ? [supabase, supabaseWs!] : []),
      ...(dev ? ["ws:"] : []),
    ],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** A random nonce (128 bits, base64), from the Web Crypto API available in the middleware. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
