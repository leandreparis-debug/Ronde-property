"use client";

import { Camera, ImagePlus } from "lucide-react";
import { type ChangeEvent, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import { useUploadQueue } from "./upload-queue-provider";

export interface PhotoPickerButtonsProps {
  /** Zone pre-filled on the photos picked here. */
  zoneKey?: string | null;
  size?: "md" | "lg";
  /** Short labels (« Photo », « Importer ») for tight spaces. */
  compact?: boolean;
  className?: string;
}

/** The accepted input types; the magic bytes decide in the end. */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * « Prendre une photo » (camera, rear lens) and « Importer des photos » (multiple). The
 * camera button comes first on touch screens, the import button first with a mouse.
 */
export function PhotoPickerButtons({
  zoneKey = null,
  size = "md",
  compact = false,
  className,
}: PhotoPickerButtonsProps) {
  const { enqueue } = useUploadQueue();
  const id = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [touch, setTouch] = useState(false);
  // Set after hydration: the hidden inputs only react to a change once React is attached.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(pointer: coarse)");
    setTouch(query.matches);
    const listener = (event: MediaQueryListEvent) => setTouch(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  function picked(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) enqueue(files, { zoneKey });
    // Same file picked twice in a row must still fire a change event.
    event.target.value = "";
  }

  const camera = (
    <Button
      key="camera"
      type="button"
      variant={touch ? "primary" : "secondary"}
      size={size}
      onClick={() => cameraRef.current?.click()}
      data-testid="take-photo"
    >
      <Camera className="size-5" aria-hidden="true" />
      {compact ? "Photo" : "Prendre une photo"}
    </Button>
  );
  const upload = (
    <Button
      key="import"
      type="button"
      variant={touch ? "secondary" : "primary"}
      size={size}
      onClick={() => importRef.current?.click()}
      data-testid="import-photos"
    >
      <ImagePlus className="size-5" aria-hidden="true" />
      {compact ? "Importer" : "Importer des photos"}
    </Button>
  );

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      data-testid="photo-picker"
      data-ready={ready ? "true" : undefined}
    >
      {touch ? [camera, upload] : [upload, camera]}
      <input
        ref={cameraRef}
        id={`${id}-camera`}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={picked}
        data-testid="camera-input"
      />
      <input
        ref={importRef}
        id={`${id}-import`}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={picked}
        data-testid="import-input"
      />
    </div>
  );
}
