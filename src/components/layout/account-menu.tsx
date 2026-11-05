"use client";

import { ChevronDown, CircleHelp, MessageSquareHeart, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";
import { cn } from "@/lib/cn";
import { APP_VERSION } from "@/lib/version";

export interface AccountMenuProps {
  fullName: string;
  roleLabel: string;
  initials: string;
  /** Top bar (below 1024 px): initials only, the panel opens downwards. */
  compact?: boolean;
}

const ITEM =
  "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-ui font-semibold text-ink hover:bg-craie";

/**
 * Account menu: « Mon compte », « Donner mon avis », « Aide », sign out and the version of the
 * application. A disclosure button (works with touch and keyboard), closed by Escape, a click
 * outside or the choice of an item.
 */
export function AccountMenu({ fullName, roleLabel, initials, compact = false }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    root.current?.querySelector<HTMLElement>("[data-menu-item]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded-md text-ink hover:bg-craie",
          compact ? "px-1" : "px-2 py-2",
        )}
        data-testid="account-menu-trigger"
      >
        <span
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill bg-brand-soft text-ui font-bold text-brand-deep"
          aria-hidden="true"
        >
          {initials}
        </span>
        {compact ? (
          <span className="sr-only">Menu du compte : {fullName}</span>
        ) : (
          <>
            <span className="flex min-w-0 flex-1 flex-col text-left">
              <span className="truncate text-ui font-semibold">{fullName}</span>
              <span className="truncate text-label text-ink-2">{roleLabel}</span>
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-ink-2 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </>
        )}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className={cn(
          "absolute z-40 w-64 rounded-lg border border-rule bg-paper p-2 shadow-raised",
          compact ? "top-full right-0 mt-2" : "bottom-full left-0 mb-2",
        )}
        data-testid="account-menu"
      >
        <nav aria-label="Compte" className="flex flex-col gap-1">
          <Link href="/compte" className={ITEM} data-menu-item onClick={() => setOpen(false)}>
            <UserRound className="size-5 shrink-0" aria-hidden="true" />
            Mon compte
          </Link>
          <button
            type="button"
            className={ITEM}
            data-menu-item
            onClick={() => {
              setOpen(false);
              setFeedbackOpen(true);
            }}
          >
            <MessageSquareHeart className="size-5 shrink-0" aria-hidden="true" />
            Donner mon avis
          </button>
          <Link href="/aide" className={ITEM} data-menu-item onClick={() => setOpen(false)}>
            <CircleHelp className="size-5 shrink-0" aria-hidden="true" />
            Aide
          </Link>
          <div className="mt-1 border-t border-rule pt-2">
            <SignOutButton variant="ghost" className="w-full justify-start" />
          </div>
          <p className="px-3 pt-1 text-label text-ink-2" data-testid="app-version">
            Version {APP_VERSION}
          </p>
        </nav>
      </div>
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}
