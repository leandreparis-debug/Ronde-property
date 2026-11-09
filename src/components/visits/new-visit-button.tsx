"use client";

import Link from "next/link";

import { useOnline } from "@/components/offline/use-online";
import { Button } from "@/components/ui/button";

/**
 * « Nouvelle visite »: a link online; offline, a disabled button with its reason (creating a
 * visit takes its site, its template and its number from the server).
 */
export function NewVisitButton() {
  const online = useOnline();
  if (online) {
    return (
      <Button asChild size="lg">
        <Link href="/visites/nouvelle">Nouvelle visite</Link>
      </Button>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="lg" disabled data-testid="new-visit-offline">
        Nouvelle visite
      </Button>
      <p className="max-w-xs text-right text-ui text-ink-2" data-testid="offline-reason-new-visit">
        Hors réseau : la création d&apos;une visite demande le réseau.
      </p>
    </div>
  );
}
