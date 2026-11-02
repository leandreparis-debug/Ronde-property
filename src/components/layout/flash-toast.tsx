"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { useToast } from "@/components/ui/toast";

const FLASH_MESSAGES: Record<string, { title: string; description?: string }> = {
  password_changed: { title: "Mot de passe modifié" },
  visit_created: { title: "Visite créée" },
  visit_duplicated: {
    title: "Visite dupliquée",
    description: "Une nouvelle visite en cours a été créée.",
  },
  visit_deleted: { title: "Visite supprimée" },
};

/** Shows a one-time success toast carried by the `flash` query parameter, then cleans the URL. */
export function FlashToast() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const shown = useRef<string | null>(null);

  const flash = searchParams.get("flash");

  useEffect(() => {
    if (!flash || shown.current === flash) return;
    const message = FLASH_MESSAGES[flash];
    if (!message) return;
    shown.current = flash;
    toast({ variant: "success", ...message });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("flash");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [flash, pathname, router, searchParams, toast]);

  return null;
}
