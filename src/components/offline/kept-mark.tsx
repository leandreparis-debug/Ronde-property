"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CloudCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { useOptionalOffline } from "./offline-provider";

/** « Disponible hors réseau » on a visit card when the visit is kept on this device. */
export function KeptMark({ visitId }: { visitId: string }) {
  const db = useOptionalOffline()?.db ?? null;
  const kept = useLiveQuery(
    async () => (db ? ((await db.visits.get(visitId))?.kept ?? false) : false),
    [db, visitId],
  );
  if (!kept) return null;
  return (
    <Badge variant="brand" data-testid="kept-offline-badge">
      <CloudCheck className="size-4" aria-hidden="true" />
      Disponible hors réseau
    </Badge>
  );
}
