"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/** Copies a value to the clipboard and confirms it in text. */
export function CopyButton({ value, label = "Copier" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={copy} aria-live="polite">
      {copied ? (
        <Check className="size-5" aria-hidden="true" />
      ) : (
        <Copy className="size-5" aria-hidden="true" />
      )}
      {copied ? "Copié" : label}
    </Button>
  );
}
