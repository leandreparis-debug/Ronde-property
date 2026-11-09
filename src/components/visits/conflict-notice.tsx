"use client";

import { RefreshCw, Scale } from "lucide-react";

import { Galet } from "@/components/brand/Galet";
import { useOffline } from "@/components/offline/offline-provider";
import { Button } from "@/components/ui/button";

import { useVisitVersion } from "./visit-version-context";

/**
 * Version conflict message: « Arbitrer » opens « À arbitrer » (field by field), « Recharger »
 * keeps the server version and reloads.
 */
export function ConflictNotice() {
  const { conflict } = useVisitVersion();
  const { engine, setArbitrating } = useOffline();
  if (!conflict) return null;
  return (
    <div
      role="alert"
      className="mb-4 flex flex-col gap-3 rounded-md border border-status-open bg-status-open-bg px-4 py-3 text-ui text-status-open sm:flex-row sm:items-center"
      data-testid="version-conflict"
    >
      <Galet mood="worried" size={32} />
      <span className="flex-1 font-medium">{conflict.message}</span>
      <div className="flex flex-wrap gap-2">
        {conflict.entry ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setArbitrating(conflict.entry!.id)}
          >
            <Scale className="size-4" aria-hidden="true" />
            Arbitrer
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const reload = () => window.location.reload();
            if (conflict.entry && engine) {
              void engine.resolveConflict(conflict.entry, null).then(reload, reload);
            } else reload();
          }}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Recharger
        </Button>
      </div>
    </div>
  );
}
