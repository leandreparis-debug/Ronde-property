"use client";

import { useRouter } from "next/navigation";
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

import { createPhotoProcessor } from "@/lib/photos/processor";
import { putWithProgress } from "@/lib/photos/put";
import { createUploadQueue, type UploadItem, type UploadQueue } from "@/lib/photos/queue";
import {
  confirmPhotoUploadAction,
  discardPendingPhotoAction,
  preparePhotoUploadAction,
  renewPhotoUploadAction,
} from "@/server/actions/photo-actions";
import type { PhotoView } from "@/server/photos/types";

export interface UploadQueueContextValue {
  items: UploadItem[];
  /** Photos confirmed since the page was loaded, in order. */
  uploaded: PhotoView[];
  enqueue: (files: File[], options?: { zoneKey?: string | null }) => void;
  retry: (localId: string) => void;
  remove: (localId: string) => void;
  clearDone: () => void;
  /** True while an upload is being processed, prepared, sent or confirmed. */
  active: boolean;
}

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

/** Access the upload queue of the visit. Must be used under <UploadQueueProvider>. */
export function useUploadQueue(): UploadQueueContextValue {
  const context = useContext(UploadQueueContext);
  if (!context) throw new Error("useUploadQueue doit être utilisé sous <UploadQueueProvider>.");
  return context;
}

/**
 * Owns the in-memory upload queue of one visit: browser processing, pending rows, direct
 * `PUT`s to the storage and confirmation. Shared by the Photos tab, the Notes tab and the
 * header pill. Warns before unload while an upload is in flight and refreshes the server
 * data once the queue goes idle.
 */
export function UploadQueueProvider({
  visitId,
  children,
}: {
  visitId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploaded, setUploaded] = useState<PhotoView[]>([]);
  const queueRef = useRef<UploadQueue | null>(null);
  const wasActive = useRef(false);

  if (!queueRef.current && typeof window !== "undefined") {
    const processor = createPhotoProcessor({ concurrency: 2 });
    queueRef.current = createUploadQueue({
      process: (file, filename) => processor.process(file, filename),
      prepare: async (prepared) => {
        const result = await preparePhotoUploadAction({ visitId, items: prepared });
        return result.ok ? result.uploads : { error: result.error };
      },
      renew: async (photoId) => {
        const result = await renewPhotoUploadAction({ photoId });
        return result.ok ? result.upload : { error: result.error };
      },
      put: putWithProgress,
      confirm: async (photoId) => {
        const result = await confirmPhotoUploadAction({ photoId });
        if (result.ok) setUploaded((list) => [...list, result.photo]);
        return result;
      },
      discard: async (photoId) => {
        await discardPendingPhotoAction({ photoId });
      },
    });
  }
  const queue = queueRef.current;

  useEffect(() => {
    if (!queue) return;
    const unsubscribe = queue.onChange(setItems);
    return () => {
      unsubscribe();
    };
  }, [queue]);

  useEffect(() => () => queue?.dispose(), [queue]);

  const active = items.some((item) => !["done", "rejected", "failed"].includes(item.status));

  // Counters and lists rendered by the server (header, cards, incomplete points) are refreshed
  // once the whole batch is through, not after every photo.
  useEffect(() => {
    if (wasActive.current && !active) router.refresh();
    wasActive.current = active;
  }, [active, router]);

  useEffect(() => {
    if (!active) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [active]);

  const enqueue = useCallback(
    (files: File[], options?: { zoneKey?: string | null }) => {
      queue?.enqueue(
        files.map((file) => ({ file, name: file.name })),
        options,
      );
    },
    [queue],
  );

  const value = useMemo<UploadQueueContextValue>(
    () => ({
      items,
      uploaded,
      enqueue,
      retry: (localId) => queue?.retry(localId),
      remove: (localId) => queue?.remove(localId),
      clearDone: () => queue?.clearDone(),
      active,
    }),
    [items, uploaded, enqueue, queue, active],
  );

  return <UploadQueueContext.Provider value={value}>{children}</UploadQueueContext.Provider>;
}
