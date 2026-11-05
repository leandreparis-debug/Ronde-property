"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Galet } from "@/components/brand/Galet";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** Network state as seen by the browser (`navigator.onLine`); online on the server. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/** How long « Connexion rétablie » stays on screen. */
export const BACK_ONLINE_MS = 4_000;

/**
 * Banner shown while the device has no network. Its wording follows the actual behaviour of
 * the queues (phase 1, in memory): a note keeps being retried (1 s, 2 s, 5 s, 10 s, then every
 * 30 s) as long as the page stays open; a photo is retried three times (1 s, 3 s, 10 s), then
 * waits for « Réessayer ». When the network comes back, « Connexion rétablie » is shown briefly.
 */
export function OfflineBanner() {
  const online = useOnline();
  const wasOffline = useRef(false);
  const [backOnline, setBackOnline] = useState(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setBackOnline(false);
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setBackOnline(true);
    const timer = setTimeout(() => setBackOnline(false), BACK_ONLINE_MS);
    return () => clearTimeout(timer);
  }, [online]);

  return (
    <div role="status" aria-live="polite" className="sticky top-0 z-30">
      {!online ? (
        <div
          data-testid="offline-banner"
          className="flex items-start gap-3 border-b border-rule bg-galet px-4 py-3 text-ui text-ink md:px-6"
        >
          <Galet mood="asleep" size={32} className="mt-0.5 shrink-0" />
          <p className="flex-1">
            <strong className="font-semibold">Hors connexion.</strong> Vos notes restent sur cette
            page et s&apos;enregistreront d&apos;elles-mêmes au retour du réseau. Les photos sont
            réessayées trois fois, puis attendent « Réessayer ». Gardez cette page ouverte.{" "}
            <Link
              href="/hors-ligne"
              className="inline-flex min-h-11 items-center font-semibold text-brand-deep underline"
            >
              En savoir plus
            </Link>
          </p>
        </div>
      ) : backOnline ? (
        <div
          data-testid="online-banner"
          className="flex items-center gap-3 border-b border-rule bg-paper px-4 py-2 text-ui text-ink md:px-6"
        >
          <Galet mood="happy" size={28} className="shrink-0" />
          <p>Connexion rétablie.</p>
        </div>
      ) : null}
    </div>
  );
}
