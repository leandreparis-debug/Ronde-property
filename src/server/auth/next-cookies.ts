import "server-only";

import { cookies } from "next/headers";

import type { CookieStore } from "./types";

/**
 * `CookieStore` over Next.js request cookies. Writes are only possible from Server Actions
 * and Route Handlers; in a Server Component they are ignored (the middleware refreshes the
 * session instead).
 */
export async function nextCookieStore(): Promise<CookieStore> {
  const store = await cookies();
  return {
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (records) => {
      try {
        for (const { name, value, options } of records) {
          store.set(name, value, options);
        }
      } catch {
        // Read-only context (Server Component): nothing to do.
      }
    },
  };
}
