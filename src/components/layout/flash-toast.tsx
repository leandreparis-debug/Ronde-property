"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { useToast } from "@/components/ui/toast";
import { replaceQuery } from "@/lib/offline/query";

const FLASH_MESSAGES: Record<string, { title: string; description?: string }> = {
  password_changed: { title: "Mot de passe modifié" },
  visit_created: { title: "Visite créée" },
  visit_duplicated: {
    title: "Visite dupliquée",
    description: "Une nouvelle visite en cours a été créée.",
  },
  visit_deleted: { title: "Visite supprimée" },
};

/**
 * Shows a one-time success toast carried by the `flash` query parameter, then cleans the URL
 * locally (no server round trip, which would race with a tab change and drop its parameters).
 */
export function FlashToast() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const shown = useRef<string | null>(null);

  const flash = searchParams.get("flash");

  useEffect(() => {
    if (!flash || shown.current === flash) return;
    const message = FLASH_MESSAGES[flash];
    if (!message) return;
    shown.current = flash;
    toast({ variant: "success", ...message });
    // Read the live URL: another component may have replaced the query in the meantime.
    const params = new URLSearchParams(window.location.search);
    params.delete("flash");
    replaceQuery(params);
  }, [flash, toast]);

  return null;
}
