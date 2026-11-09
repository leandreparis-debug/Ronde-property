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

import { useOffline } from "@/components/offline/offline-provider";
import { useVisit } from "@/components/offline/visit-data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uuidv7 } from "@/lib/offline/ids";
import { formatBytes } from "@/lib/offline/storage";
import { createPhotoProcessor, type PhotoProcessor } from "@/lib/photos/processor";
import type { UploadItem } from "@/lib/photos/upload-items";
import { discardPendingPhotoAction } from "@/server/actions/photo-actions";
import type { PhotoView } from "@/server/photos/types";

export interface UploadQueueContextValue {
  items: UploadItem[];
  /**
   * Photos added from this page since it was opened, in order, as soon as they are stored on
   * the device (before the upload): a reserve or a marker can use them at once, offline too.
   */
  uploaded: PhotoView[];
  enqueue: (files: File[], options?: { zoneKey?: string | null }) => void;
  retry: (localId: string) => void;
  remove: (localId: string) => void;
  clearDone: () => void;
  /** True while a photo is being prepared or sent. */
  active: boolean;
}

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

/** Access the upload queue of the visit. Must be used under <UploadQueueProvider>. */
export function useUploadQueue(): UploadQueueContextValue {
  const context = useContext(UploadQueueContext);
  if (!context) throw new Error("useUploadQueue doit être utilisé sous <UploadQueueProvider>.");
  return context;
}

interface LocalItem {
  localId: string;
  name: string;
  zoneKey: string | null;
  status: "processing" | "rejected";
  error: string | null;
}

/**
 * Photos of a visit, on top of the synchronisation engine (step 12): each picked file is
 * compressed in the browser (worker), stored as two blobs in IndexedDB and queued
 * (`photo.create`, signed `PUT`, `photo.confirm`). The upload resumes after a reload or a
 * network loss; the blobs are dropped after the confirmation unless the visit is kept offline.
 * Above 80 % of the storage quota, a new photo taken offline asks for a confirmation.
 */
export function UploadQueueProvider({
  visitId,
  children,
}: {
  visitId: string;
  children: ReactNode;
}) {
  const { engine, status, online, usage, refreshUsage } = useOffline();
  const data = useVisit();
  const [local, setLocal] = useState<LocalItem[]>([]);
  const [uploaded, setUploaded] = useState<PhotoView[]>([]);
  const [quotaFiles, setQuotaFiles] = useState<{
    files: File[];
    zoneKey: string | null;
  } | null>(null);
  const processor = useRef<PhotoProcessor | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const created = createPhotoProcessor({ concurrency: 2 });
    processor.current = created;
    return () => {
      created.dispose();
      processor.current = null;
    };
  }, []);

  const start = useCallback(
    (files: File[], zoneKey: string | null) => {
      if (!engine || !processor.current) return;
      const current = processor.current;
      for (const file of files) {
        const localId = `local-${uuidv7()}`;
        setLocal((list) => [
          ...list,
          { localId, name: file.name, zoneKey, status: "processing", error: null },
        ]);
        const processed = current.process(file, file.name);
        // Compression runs in parallel; the photos join the outbox in the order picked.
        chain.current = chain.current.then(async () => {
          try {
            const photo = await processed;
            const photoId = uuidv7();
            await engine.enqueuePhoto({
              visitId,
              photoId,
              name: file.name,
              main: photo.main,
              thumb: photo.thumb,
              item: {
                originalFilename: photo.originalFilename,
                width: photo.width,
                height: photo.height,
                sizeBytes: photo.main.size,
                thumbSizeBytes: photo.thumb.size,
                takenAt: photo.takenAt,
                zoneKey,
              },
            });
            setLocal((list) => list.filter((item) => item.localId !== localId));
            setUploaded((list) => [
              ...list,
              {
                id: photoId,
                visitId,
                caption: null,
                category: "general",
                zoneKey,
                zoneLabel: null,
                takenAt: photo.takenAt,
                width: photo.width,
                height: photo.height,
                sizeBytes: photo.main.size,
                sortOrder: Number.MAX_SAFE_INTEGER,
                isCover: false,
                originalFilename: photo.originalFilename,
                createdByName: null,
                createdAt: new Date().toISOString(),
                url: null,
                thumbUrl: null,
                urlsExpireAt: new Date().toISOString(),
              },
            ]);
          } catch (error) {
            setLocal((list) =>
              list.map((item) =>
                item.localId === localId
                  ? {
                      ...item,
                      status: "rejected",
                      error:
                        error instanceof Error ? error.message : "Impossible de préparer l'image.",
                    }
                  : item,
              ),
            );
          }
        });
      }
      void chain.current.then(() => refreshUsage());
    },
    [engine, refreshUsage, visitId],
  );

  const enqueue = useCallback(
    (files: File[], options?: { zoneKey?: string | null }) => {
      const zoneKey = options?.zoneKey ?? null;
      if (!online && usage?.nearQuota) {
        setQuotaFiles({ files, zoneKey });
        return;
      }
      start(files, zoneKey);
    },
    [online, start, usage?.nearQuota],
  );

  const photoById = useMemo(
    () => new Map(data.photos.map((photo) => [photo.id, photo])),
    [data.photos],
  );

  const items = useMemo<UploadItem[]>(() => {
    const fromOutbox: UploadItem[] = data.outbox
      .filter((entry) => entry.kind === "photo.create" && entry.photo)
      .map((entry) => {
        const stage = entry.photo!.stage;
        const failed = entry.status === "rejected";
        const waiting =
          entry.lastError ??
          (!online ? "Hors réseau : la photo partira au retour du réseau." : null);
        return {
          localId: entry.opId,
          name: entry.photo!.name,
          zoneKey: null,
          status: failed
            ? "failed"
            : stage === "create"
              ? "preparing"
              : stage === "put"
                ? "uploading"
                : "confirming",
          progress: entry.photo!.progress,
          previewUrl: photoById.get(entry.entityId)?.thumbUrl ?? null,
          error: failed ? (entry.rejection?.message ?? entry.lastError) : waiting,
          photoId: entry.entityId,
          attempts: entry.attempts,
        } satisfies UploadItem;
      });
    const done: UploadItem[] = status.recent
      .filter((recent) => photoById.get(recent.photoId)?.visitId === visitId)
      .map((recent) => ({
        localId: recent.opId,
        name: recent.label.replace(/^Photo /, ""),
        zoneKey: null,
        status: "done",
        progress: 100,
        previewUrl: photoById.get(recent.photoId)?.thumbUrl ?? null,
        error: null,
        photoId: recent.photoId,
        attempts: 0,
      }));
    const preparing: UploadItem[] = local.map((item) => ({
      localId: item.localId,
      name: item.name,
      zoneKey: item.zoneKey,
      status: item.status,
      progress: 0,
      previewUrl: null,
      error: item.error,
      photoId: null,
      attempts: 0,
    }));
    return [...done, ...fromOutbox, ...preparing];
  }, [data.outbox, local, online, photoById, status.recent, visitId]);

  const active = items.some((item) => !["done", "rejected", "failed"].includes(item.status));

  const value = useMemo<UploadQueueContextValue>(
    () => ({
      items,
      uploaded,
      enqueue,
      retry: (localId) => void engine?.retry(localId),
      remove: (localId) => {
        if (localId.startsWith("local-")) {
          setLocal((list) => list.filter((item) => item.localId !== localId));
          return;
        }
        const item = items.find((candidate) => candidate.localId === localId);
        if (item?.status === "done") {
          engine?.clearRecent();
          return;
        }
        void engine?.remove(localId).then(() => {
          // The server may hold a pending row already: drop it (the nightly purge would anyway).
          if (item?.photoId && navigator.onLine) {
            void discardPendingPhotoAction({ photoId: item.photoId }).catch(() => undefined);
          }
        });
      },
      clearDone: () => engine?.clearRecent(),
      active,
    }),
    [items, uploaded, enqueue, engine, active],
  );

  return (
    <UploadQueueContext.Provider value={value}>
      {children}
      <Dialog open={quotaFiles !== null} onOpenChange={(open) => !open && setQuotaFiles(null)}>
        <DialogContent data-testid="quota-confirm">
          <DialogHeader>
            <DialogTitle>Stockage de la tablette presque plein</DialogTitle>
            <DialogDescription>
              {usage
                ? `${formatBytes(usage.usageBytes)} utilisés${usage.quotaBytes ? ` sur ${formatBytes(usage.quotaBytes)}` : ""}.`
                : ""}{" "}
              Hors réseau, chaque photo reste sur la tablette jusqu&apos;au retour du réseau. Si
              l&apos;espace manque, la tablette peut refuser d&apos;enregistrer. Ajouter quand même
              ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                if (quotaFiles) start(quotaFiles.files, quotaFiles.zoneKey);
                setQuotaFiles(null);
              }}
              data-testid="quota-confirm-add"
            >
              Ajouter la photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UploadQueueContext.Provider>
  );
}
