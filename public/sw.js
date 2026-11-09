/*
 * RONDE service worker (step 12, docs/pwa.md). Written by hand on purpose (ADR 0001):
 *
 * - precaches the offline shell (`/hors-ligne`, `/hors-ligne/visite`), its scripts and styles,
 *   the manifest and the icons;
 * - keeps a copy of every `/_next/static/*` file it sees (fingerprinted, immutable: scripts,
 *   styles, fonts, the pdf.js worker), of the icons, splash screens and report fonts;
 * - navigations go to the network first; without network, `/`, `/visites/…` and
 *   `/visites/…/reserves/…` get the offline shell, rendered from the local store, and any other
 *   page gets `/hors-ligne`;
 * - **never** caches an API answer (`/api/*`), a server action (`POST`), a signed URL
 *   (`/api/local-storage`, Supabase) nor a page with data: those requests are not even
 *   intercepted.
 *
 * The version comes from the registration URL (`/sw.js?v=…`): a new deployment installs a new
 * worker, which waits until the user accepts « Mettre à jour » (no forced reload while changes
 * wait in the outbox).
 */

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const SHELL_CACHE = `ronde-shell-${VERSION}`;
const STATIC_CACHE = `ronde-static-${VERSION}`;
const SHELL_PAGE = "/hors-ligne/visite";
const OFFLINE_PAGE = "/hors-ligne";
const PRECACHE = [
  SHELL_PAGE,
  OFFLINE_PAGE,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/apple-icon.png",
  "/favicon.ico",
  "/icon.svg",
];

/** Paths whose files never change once deployed (or change with the version). */
function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/splash/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/apple-icon.png" ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/icon.svg"
  );
}

/** Pages the offline shell can render from the local store. */
function isShellRoute(url) {
  return (
    url.pathname === "/" ||
    /^\/visites\/[0-9a-f-]{36}(\/reserves\/[0-9a-f-]{36})?\/?$/i.test(url.pathname)
  );
}

/** Script, style and media files referenced by an HTML page (tags and flight data). */
function assetsOf(html) {
  const found = new Set();
  for (const match of html.matchAll(/\/_next\/static\/[^"'\s)\\<>]+/g)) found.add(match[0]);
  for (const match of html.matchAll(/["'](static\/(?:chunks|css|media)\/[^"'\s\\]+)["']/g)) {
    found.add(`/_next/${match[1]}`);
  }
  return [...found];
}

/** Caches a page and every static file it needs. */
async function cachePage(path) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok || response.redirected) return;
  const html = await response.clone().text();
  const shell = await caches.open(SHELL_CACHE);
  await shell.put(path, response);
  const statics = await caches.open(STATIC_CACHE);
  await Promise.all(
    assetsOf(html).map(async (asset) => {
      if (await statics.match(asset)) return;
      try {
        const file = await fetch(asset, { credentials: "same-origin" });
        if (file.ok) await statics.put(asset, file);
      } catch {
        // Picked up later, the first time the page loads it.
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const statics = await caches.open(STATIC_CACHE);
      await Promise.all(
        PRECACHE.filter((path) => path !== SHELL_PAGE && path !== OFFLINE_PAGE).map(
          async (path) => {
            try {
              const response = await fetch(path, { credentials: "same-origin" });
              if (response.ok) await statics.put(path, response);
            } catch {
              // Optional asset: cached on first use.
            }
          },
        ),
      );
      await cachePage(SHELL_PAGE);
      await cachePage(OFFLINE_PAGE);
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, STATIC_CACHE]);
      for (const name of await caches.keys()) {
        if (name.startsWith("ronde-") && !keep.has(name)) await caches.delete(name);
      }
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
  // The application asks for a fresh copy of the shell (after a deployment, once online).
  if (event.data && event.data.type === "REFRESH_SHELL") {
    event.waitUntil(Promise.all([cachePage(SHELL_PAGE), cachePage(OFFLINE_PAGE)]));
  }
});

async function fromCacheOrNetwork(request) {
  const statics = await caches.open(STATIC_CACHE);
  const cached = await statics.match(request, { ignoreSearch: false });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") await statics.put(request, response.clone());
  return response;
}

async function navigate(event) {
  const url = new URL(event.request.url);
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    const shell = await caches.open(SHELL_CACHE);
    const page = isShellRoute(url) ? SHELL_PAGE : OFFLINE_PAGE;
    return (
      (await shell.match(page)) ||
      (await shell.match(OFFLINE_PAGE)) ||
      new Response("Hors réseau.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Other origins (Supabase: signed URLs, auth) are never touched.
  if (url.origin !== self.location.origin) return;
  // No API answer, no signed URL, no data is ever cached.
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(navigate(event));
    return;
  }
  if (isStatic(url)) {
    event.respondWith(fromCacheOrNetwork(request));
  }
  // Everything else (RSC payloads of pages, …) goes to the network as usual.
});
