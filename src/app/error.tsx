"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Generic error screen (database unavailable, unexpected failure). The stack trace stays in
 * the server logs: only a generic message is shown.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ronde] page error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-craie px-4 text-ink">
      <EmptyState
        mood="worried"
        title="Une erreur s'est produite"
        description="Le service est momentanément indisponible. Réessayez dans un instant."
        action={
          <div className="flex flex-col items-center gap-3">
            <Button size="lg" onClick={reset}>
              Réessayer
            </Button>
            {error.digest ? <p className="text-ui text-ink-2">Référence : {error.digest}</p> : null}
          </div>
        }
      />
    </div>
  );
}
