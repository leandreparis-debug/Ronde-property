import type { Metadata } from "next";

import { OfflineShell } from "@/components/offline/offline-shell";

export const metadata: Metadata = { title: "Hors réseau" };

/**
 * Offline shell (step 12): public and without data, precached by the service worker and served
 * in place of `/`, `/visites/[id]` and a reserve detail when there is no network. Everything it
 * shows comes from the local store of the device (docs/offline.md).
 */
export default function OfflineShellPage() {
  return <OfflineShell />;
}
