"use client";

import "./globals.css";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Last-resort error screen, shown when the root layout itself fails: it replaces the whole
 * document (own `<html>` and `<body>`), so it relies on the fallback fonts. Only a generic
 * message and the error digest reach the browser; the detail stays in the server logs.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ronde] global error", error.digest ?? "sans référence");
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <main
          id="main"
          className="flex min-h-dvh items-center justify-center bg-craie px-4 text-ink"
        >
          <EmptyState
            mood="worried"
            title="RONDE ne répond pas"
            description="Une erreur inattendue empêche l'affichage de l'application. Réessayez dans un instant ; si le problème continue, signalez-le avec la référence ci-dessous."
            action={
              <div className="flex flex-col items-center gap-3">
                <Button size="lg" onClick={reset}>
                  Réessayer
                </Button>
                {error.digest ? (
                  <p className="text-ui text-ink-2">Référence : {error.digest}</p>
                ) : null}
              </div>
            }
          />
        </main>
      </body>
    </html>
  );
}
