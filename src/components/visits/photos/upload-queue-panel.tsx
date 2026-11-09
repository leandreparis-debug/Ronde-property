"use client";

import { CircleAlert, CircleCheck, ImageOff, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { type UploadItem, uploadStatusLabel } from "@/lib/photos/upload-items";

import { useUploadQueue } from "./upload-queue-provider";

/**
 * File of uploads: local thumbnail, state (« Préparation », « Envoi 45 % », « Terminé »,
 * « Échec »), progress bar, « Réessayer » and « Retirer ». Hidden while empty.
 */
export function UploadQueuePanel({ className }: { className?: string }) {
  const { items, retry, remove, clearDone } = useUploadQueue();
  if (items.length === 0) return null;
  const done = items.filter((item) => item.status === "done").length;
  const active =
    items.length -
    done -
    items.filter((i) => i.status === "rejected" || i.status === "failed").length;

  return (
    <section
      aria-labelledby="upload-queue-title"
      className={cn("rounded-lg border border-rule bg-paper p-4", className)}
      data-testid="upload-queue"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="upload-queue-title" className="font-display text-title-sm text-ink">
          Envois{" "}
          <span className="text-ink-2" data-testid="upload-queue-summary">
            {active > 0 ? `· ${active} en cours` : done > 0 ? "· terminés" : ""}
          </span>
        </h3>
        {done > 0 ? (
          <Button type="button" variant="ghost" onClick={clearDone}>
            Effacer les terminés
          </Button>
        ) : null}
      </div>
      <ul className="mt-3 flex flex-col gap-2" aria-live="polite">
        {items.map((item) => (
          <UploadRow key={item.localId} item={item} onRetry={retry} onRemove={remove} />
        ))}
      </ul>
    </section>
  );
}

function UploadRow({
  item,
  onRetry,
  onRemove,
}: {
  item: UploadItem;
  onRetry: (localId: string) => void;
  onRemove: (localId: string) => void;
}) {
  const failed = item.status === "failed" || item.status === "rejected";
  const label = uploadStatusLabel(item);
  return (
    <li
      className="flex items-center gap-3 rounded-md bg-craie px-3 py-2"
      data-testid="upload-item"
      data-status={item.status}
    >
      <div className="size-12 shrink-0 overflow-hidden rounded-md bg-galet">
        {item.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL
          <img
            src={item.previewUrl}
            alt=""
            width={48}
            height={48}
            className="size-12 object-cover"
          />
        ) : (
          <span className="flex size-12 items-center justify-center text-ink-2">
            <ImageOff className="size-5" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui font-semibold text-ink">{item.name}</p>
        <p
          className={cn(
            "flex items-center gap-1.5 text-ui",
            failed ? "text-status-open" : "text-ink-2",
          )}
          data-testid="upload-status"
        >
          {item.status === "done" ? (
            <CircleCheck className="size-4 text-status-done" aria-hidden="true" />
          ) : failed ? (
            <CircleAlert className="size-4" aria-hidden="true" />
          ) : null}
          {label}
        </p>
        {item.status === "uploading" || item.status === "confirming" ? (
          <div
            role="progressbar"
            aria-label={`Envoi de ${item.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={item.progress}
            className="mt-1 h-1.5 w-full overflow-hidden rounded-pill bg-galet"
          >
            <div
              className="h-full bg-brand transition-[width]"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.status === "failed" ? (
          <Button type="button" variant="secondary" onClick={() => onRetry(item.localId)}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Réessayer
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          onClick={() => onRemove(item.localId)}
          aria-label={`Retirer ${item.name}`}
        >
          <X className="size-5" aria-hidden="true" />
          <span className="hidden sm:inline">Retirer</span>
        </Button>
      </div>
    </li>
  );
}
