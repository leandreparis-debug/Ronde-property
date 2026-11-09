"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Galet } from "@/components/brand/Galet";
import { useOptionalOffline } from "@/components/offline/offline-provider";
import { useOnline } from "@/components/offline/use-online";

export { useOnline } from "@/components/offline/use-online";

/** How long « Connexion rétablie » stays on screen. */
export const BACK_ONLINE_MS = 4_000;

/**
 * One consistent message about the network (step 12): offline, the changes stay on the device
 * and leave by themselves when the network is back; an expired session asks to sign in again
 * without losing anything; back online, « Connexion rétablie » while the changes are sent.
 * The details (what waits, conflicts) are in the synchronisation panel of the header.
 */
export function OfflineBanner() {
  const online = useOnline();
  const offline = useOptionalOffline();
  const wasOffline = useRef(false);
  const [backOnline, setBackOnline] = useState(false);
  const pending = offline?.status.pending ?? 0;
  const expired = offline?.status.state === "auth" && offline.status.authReason === "signed_out";

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
            <strong className="font-semibold">Hors réseau.</strong> Vos saisies sont gardées sur cet
            appareil et partiront d&apos;elles-mêmes au retour du réseau
            {pending > 0 ? ` (${pending} modification${pending > 1 ? "s" : ""} en attente)` : ""}.
            Les visites gardées hors réseau restent consultables.{" "}
            <Link
              href="/hors-ligne"
              className="inline-flex min-h-11 items-center font-semibold text-brand-deep underline"
            >
              En savoir plus
            </Link>
          </p>
        </div>
      ) : expired ? (
        <div
          role="alert"
          data-testid="session-expired-banner"
          className="flex flex-wrap items-center gap-3 border-b border-rule bg-status-progress-bg px-4 py-3 text-ui text-ink md:px-6"
        >
          <Galet mood="worried" size={32} className="shrink-0" />
          <p className="flex-1">
            <strong className="font-semibold">Session expirée.</strong> Reconnectez-vous pour
            envoyer {pending > 0 ? `vos ${pending} modifications` : "vos modifications"} : rien
            n&apos;est perdu.
          </p>
          <a
            href={`/connexion?next=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.pathname + window.location.search)}`}
            className="inline-flex min-h-11 items-center font-semibold text-brand-deep underline"
          >
            Se reconnecter
          </a>
        </div>
      ) : backOnline ? (
        <div
          data-testid="online-banner"
          className="flex items-center gap-3 border-b border-rule bg-paper px-4 py-2 text-ui text-ink md:px-6"
        >
          <Galet mood="happy" size={28} className="shrink-0" />
          <p>
            Connexion rétablie.
            {pending > 0 ? " Envoi de vos modifications en cours." : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
