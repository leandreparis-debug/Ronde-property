"use client";

import { LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { useUploadQueue } from "./upload-queue-provider";

/** Header pill « 3 envois en cours » while the upload queue has active items. */
export function UploadQueuePill() {
  const { items } = useUploadQueue();
  const active = items.filter(
    (item) => !["done", "rejected", "failed"].includes(item.status),
  ).length;
  if (active === 0) return null;
  return (
    <Badge variant="brand" data-testid="upload-pill" role="status">
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      {active} envoi{active > 1 ? "s" : ""} en cours
    </Badge>
  );
}
