"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

import type { ConflictEntry } from "@/lib/offline/db";

/** A version conflict of the visit, with its entry of the store when there is one. */
export interface VisitConflict {
  message: string;
  entry: ConflictEntry | null;
}

interface VisitVersionValue {
  conflict: VisitConflict | null;
  setConflict: (conflict: VisitConflict | null) => void;
}

const VisitVersionContext = createContext<VisitVersionValue | null>(null);

/**
 * Shares the conflict of the visit between the information form and the participants panel.
 * Since step 12 the version itself is read by the outbox when an operation is queued.
 */
export function VisitVersionProvider({ children }: { children: ReactNode }) {
  const [conflict, setConflict] = useState<VisitConflict | null>(null);
  const value = useMemo(() => ({ conflict, setConflict }), [conflict]);
  return <VisitVersionContext.Provider value={value}>{children}</VisitVersionContext.Provider>;
}

export function useVisitVersion(): VisitVersionValue {
  const value = useContext(VisitVersionContext);
  if (!value) throw new Error("useVisitVersion doit être utilisé sous <VisitVersionProvider>.");
  return value;
}
