"use client";

import { RefreshCw } from "lucide-react";

import { Galet } from "@/components/brand/Galet";
import { Button } from "@/components/ui/button";

import { useVisitVersion } from "./visit-version-context";

/** Version conflict message with the reload button. */
export function ConflictNotice() {
  const { conflict } = useVisitVersion();
  if (!conflict) return null;
  return (
    <div
      role="alert"
      className="mb-4 flex flex-col gap-3 rounded-md border border-status-open bg-status-open-bg px-4 py-3 text-ui text-status-open sm:flex-row sm:items-center"
      data-testid="version-conflict"
    >
      <Galet mood="worried" size={32} />
      <span className="flex-1 font-medium">{conflict}</span>
      <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
        <RefreshCw className="size-4" aria-hidden="true" />
        Recharger
      </Button>
    </div>
  );
}
