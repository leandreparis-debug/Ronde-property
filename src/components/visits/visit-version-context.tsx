"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

interface VisitVersionValue {
  version: number;
  /** Records the version returned by a successful write. */
  advance: (version: number) => void;
  conflict: string | null;
  setConflict: (message: string | null) => void;
}

const VisitVersionContext = createContext<VisitVersionValue | null>(null);

/** Shares the visit version between the information form and the participants panel. */
export function VisitVersionProvider({
  initialVersion,
  children,
}: {
  initialVersion: number;
  children: ReactNode;
}) {
  const [version, setVersion] = useState(initialVersion);
  const [conflict, setConflict] = useState<string | null>(null);
  const advance = useCallback(
    (next: number) => setVersion((current) => Math.max(current, next)),
    [],
  );
  const value = useMemo(
    () => ({ version, advance, conflict, setConflict }),
    [version, advance, conflict],
  );
  return <VisitVersionContext.Provider value={value}>{children}</VisitVersionContext.Provider>;
}

export function useVisitVersion(): VisitVersionValue {
  const value = useContext(VisitVersionContext);
  if (!value) throw new Error("useVisitVersion doit être utilisé sous <VisitVersionProvider>.");
  return value;
}
