"use client";

import { useEffect, useState } from "react";

import { Galet } from "@/components/brand/Galet";
import { Button } from "@/components/ui/button";

import { useOptionalOffline } from "./offline-provider";

/** Version of the deployment, in the URL of the service worker (a new one installs a new worker). */
export const SW_VERSION = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

declare global {
  interface Window {
    /** Worker of a new deployment, waiting for « Mettre à jour ». */
    __rondeWaitingWorker?: ServiceWorker | null;
  }
}

const UPDATE_EVENT = "ronde:sw-update";

/**
 * Registers the service worker (production builds only, `docs/pwa.md`) and announces a new
 * version waiting. No forced reload: the user decides, once the outbox is empty.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let reloading = false;
    const announce = (worker: ServiceWorker | null) => {
      window.__rondeWaitingWorker = worker;
      window.dispatchEvent(new Event(UPDATE_EVENT));
    };
    void navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(SW_VERSION)}`, { scope: "/" })
      .then((registration) => {
        // A first install has nothing to replace; an update waits for the user.
        if (registration.waiting && navigator.serviceWorker.controller) {
          announce(registration.waiting);
        }
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              announce(installing);
            }
          });
        });
      })
      .catch(() => undefined);
    const onControllerChange = () => {
      if (reloading || !window.__rondeWaitingWorker) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);
  return null;
}

/**
 * « Nouvelle version disponible »: shown when a new deployment waits. « Mettre à jour » reloads
 * on the new version, and is held back while changes wait for the server.
 */
export function AppUpdatePrompt() {
  const offline = useOptionalOffline();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    const read = () => setWaiting(window.__rondeWaitingWorker ?? null);
    read();
    window.addEventListener(UPDATE_EVENT, read);
    return () => window.removeEventListener(UPDATE_EVENT, read);
  }, []);
  if (!waiting) return null;
  const pending = (offline?.status.pending ?? 0) + (offline?.status.conflicts ?? 0);
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 border-b border-rule bg-brand-tint px-4 py-2 text-ui text-ink md:px-6"
      data-testid="app-update"
    >
      <Galet mood="attentive" size={28} className="shrink-0" />
      <p className="flex-1">
        <strong className="font-semibold">Nouvelle version disponible.</strong>{" "}
        {pending > 0
          ? "Elle s'installera une fois vos modifications envoyées au serveur."
          : "Mettez à jour quand vous le souhaitez : rien n'est perdu."}
      </p>
      <Button
        type="button"
        variant="secondary"
        disabled={pending > 0}
        onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}
        data-testid="app-update-apply"
      >
        Mettre à jour
      </Button>
    </div>
  );
}
