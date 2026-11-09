"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { clearDeviceUser, type DeviceUser, writeDeviceUser } from "@/lib/offline/device-user";
import { META_KEYS, openLocalDb, readMeta, type RondeLocalDb, writeMeta } from "@/lib/offline/db";
import { createSyncEngine, type SyncEngine, type SyncStatus } from "@/lib/offline/engine";
import { mergeSnapshot } from "@/lib/offline/merge";
import type { SyncAuthFailure } from "@/lib/offline/ops";
import type { VisitSnapshot } from "@/lib/offline/snapshot";
import { estimateUsage, requestPersistence, type StorageUsage } from "@/lib/offline/storage";
import { createFetchTransport } from "@/lib/offline/transport";
import { inactivityInputs, shouldWipeForInactivity, wipeLocalData } from "@/lib/offline/wipe";

import { useOnline } from "./use-online";

const INITIAL_STATUS: SyncStatus = {
  state: "idle",
  pending: 0,
  rejected: 0,
  conflicts: 0,
  lastSyncAt: null,
  nextRetryAt: null,
  message: null,
  authReason: null,
  recent: [],
};

/** Where the sign-in page is told why the device lost its session. */
export const SESSION_REASON_PARAM = "session";

export interface OfflineContextValue {
  user: DeviceUser;
  /** Local database of the user; null until opened in the browser. */
  db: RondeLocalDb | null;
  engine: SyncEngine | null;
  status: SyncStatus;
  online: boolean;
  /** Keep automatically the visits opened on a tablet. */
  autoKeep: boolean;
  setAutoKeep: (value: boolean) => void;
  usage: StorageUsage | null;
  refreshUsage: () => Promise<void>;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  /** Conflict to arbitrate, opened from the panel or a tab. */
  arbitrating: string | null;
  setArbitrating: (conflictId: string | null) => void;
  /** Reads the visit again from the server and merges it (online only). */
  refreshVisit: (visitId: string) => Promise<VisitSnapshot | null>;
  /** Erases the local copy (sign-out). */
  wipe: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

/** The offline context; throws outside the provider. */
export function useOffline(): OfflineContextValue {
  const value = useContext(OfflineContext);
  if (!value) throw new Error("useOffline doit être utilisé sous <OfflineProvider>.");
  return value;
}

/** The offline context, or null outside the provider (pages without the application shell). */
export function useOptionalOffline(): OfflineContextValue | null {
  return useContext(OfflineContext);
}

/** Fetches the snapshot of a visit; `null` when it is gone, throws on a network failure. */
export async function fetchVisitSnapshot(
  visitId: string,
): Promise<{ snapshot: VisitSnapshot } | { status: number; reason?: SyncAuthFailure }> {
  const response = await fetch(`/api/sync/visits/${visitId}`, { credentials: "same-origin" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: SyncAuthFailure };
    return { status: response.status, reason: body.error };
  }
  return { snapshot: (await response.json()) as VisitSnapshot };
}

/**
 * Owns the local copy and the synchronisation engine of the signed-in user, for the whole
 * application shell: opens `ronde-<userId>`, wipes it after 14 days without contact, asks for
 * persistent storage, starts the engine (online, visibility, 30 s timer) and reacts to the
 * session refusals (revoked or deactivated account: the copy is erased).
 */
export function OfflineProvider({
  user: given,
  children,
}: {
  user: DeviceUser;
  children: ReactNode;
}) {
  // A server refresh re-renders the shell with a new object: only the values matter.
  const user = useMemo<DeviceUser>(
    () => ({ id: given.id, name: given.name, role: given.role }),
    [given.id, given.name, given.role],
  );
  const online = useOnline();
  const [db, setDb] = useState<RondeLocalDb | null>(null);
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const [status, setStatus] = useState<SyncStatus>(INITIAL_STATUS);
  const [autoKeep, setAutoKeepState] = useState(true);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [arbitrating, setArbitrating] = useState<string | null>(null);
  const refreshTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const dbRef = useRef<RondeLocalDb | null>(null);

  const refreshUsage = useCallback(async () => {
    setUsage(await estimateUsage());
  }, []);

  const refreshVisit = useCallback(async (visitId: string) => {
    const current = dbRef.current;
    if (!current || !navigator.onLine) return null;
    try {
      const result = await fetchVisitSnapshot(visitId);
      if ("snapshot" in result) {
        await mergeSnapshot(current, result.snapshot);
        return result.snapshot;
      }
    } catch {
      // Unreachable: the store keeps its copy.
    }
    return null;
  }, []);

  useEffect(() => {
    const timers = refreshTimers.current;
    writeDeviceUser(user);
    let cancelled = false;
    let stop: (() => void) | null = null;
    let created: SyncEngine | null = null;
    const opened = openLocalDb(user.id);
    void (async () => {
      try {
        await opened.open();
      } catch {
        // IndexedDB unavailable (very old browser, blocked storage): on-line only.
        return;
      }
      const now = new Date().toISOString();
      if (!(await readMeta<string>(opened, "firstOpenedAt"))) {
        await writeMeta(opened, "firstOpenedAt", now);
      }
      const inputs = await inactivityInputs(opened);
      let current = opened;
      if (shouldWipeForInactivity(inputs.lastServerContactAt, inputs.firstOpenedAt, Date.now())) {
        await wipeLocalData(opened);
        current = openLocalDb(user.id);
        await current.open();
        await writeMeta(current, "firstOpenedAt", now);
      }
      if (cancelled) {
        current.close();
        return;
      }
      setAutoKeepState((await readMeta<boolean>(current, META_KEYS.autoKeep)) ?? true);
      dbRef.current = current;
      created = createSyncEngine({
        db: current,
        transport: createFetchTransport(),
        user: { id: user.id, name: user.name },
        isOnline: () => navigator.onLine,
        onAuthFailure: (reason) => {
          if (reason === "signed_out") return;
          void (async () => {
            created?.dispose();
            await wipeLocalData(current);
            clearDeviceUser();
            window.location.assign(
              `/connexion?${SESSION_REASON_PARAM}=${reason === "revoked" ? "revoquee" : "desactive"}`,
            );
          })();
        },
        onApplied: (visitId) => {
          const timers = refreshTimers.current;
          const previous = timers.get(visitId);
          if (previous) clearTimeout(previous);
          timers.set(
            visitId,
            setTimeout(() => {
              timers.delete(visitId);
              void refreshVisit(visitId);
            }, 1_200),
          );
        },
      });
      created.onStatus(setStatus);
      stop = created.start();
      setDb(current);
      setEngine(created);
      void requestPersistence().then(() => refreshUsage());
    })();
    return () => {
      cancelled = true;
      stop?.();
      created?.dispose();
      dbRef.current?.close();
      dbRef.current = null;
      setDb(null);
      setEngine(null);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [user, refreshUsage, refreshVisit]);

  const setAutoKeep = useCallback(
    (value: boolean) => {
      setAutoKeepState(value);
      if (db) void writeMeta(db, META_KEYS.autoKeep, value);
    },
    [db],
  );

  const wipe = useCallback(async () => {
    engine?.dispose();
    if (db) await wipeLocalData(db);
    clearDeviceUser();
  }, [db, engine]);

  const value = useMemo<OfflineContextValue>(
    () => ({
      user,
      db,
      engine,
      status,
      online,
      autoKeep,
      setAutoKeep,
      usage,
      refreshUsage,
      panelOpen,
      setPanelOpen,
      arbitrating,
      setArbitrating,
      refreshVisit,
      wipe,
    }),
    [
      user,
      db,
      engine,
      status,
      online,
      autoKeep,
      setAutoKeep,
      usage,
      refreshUsage,
      panelOpen,
      arbitrating,
      refreshVisit,
      wipe,
    ],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}
