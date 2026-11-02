"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { Info, X } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

import { Galet } from "@/components/brand/Galet";
import { cn } from "@/lib/cn";

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. Errors stay longer by default. */
  duration?: number;
}

interface ToastItem extends Required<Pick<ToastOptions, "title" | "variant">> {
  id: number;
  description?: string;
  duration: number;
}

interface ToastContextValue {
  /** Show a toast. Returns its id. */
  toast: (options: ToastOptions) => number;
  /** Dismiss a toast early. */
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Access the toast API. Must be used under <ToastProvider>.
 *
 * @example
 * const { toast } = useToast();
 * toast({ variant: "success", title: "Réserve levée" });
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast doit être utilisé sous <ToastProvider>.");
  }
  return context;
}

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 5_000,
  error: 10_000,
  info: 6_000,
};

/**
 * Mounts the Radix toast provider and viewport. Place it once in the application shell.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const variant = options.variant ?? "info";
    const id = Date.now() + Math.random();
    setItems((current) => [
      ...current,
      {
        id,
        title: options.title,
        description: options.description,
        variant,
        duration: options.duration ?? DEFAULT_DURATION[variant],
      },
    ]);
    return id;
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" label="Notification">
        {children}
        {items.map((item) => (
          <Toast
            key={item.id}
            variant={item.variant}
            title={item.title}
            description={item.description}
            duration={item.duration}
            onOpenChange={(open) => {
              if (!open) dismiss(item.id);
            }}
          />
        ))}
        <ToastPrimitive.Viewport
          className={cn(
            "fixed right-0 bottom-0 z-[60] flex w-full max-w-[420px] flex-col gap-2 p-4 outline-none",
            "pb-[calc(1rem+var(--spacing-bottomnav)+env(safe-area-inset-bottom,0px))] lg:pb-4",
          )}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export interface ToastProps extends ToastPrimitive.ToastProps {
  variant?: ToastVariant;
  title: string;
  description?: string;
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  switch (variant) {
    case "success":
      return <Galet mood="happy" size={32} />;
    case "error":
      return <Galet mood="worried" size={32} />;
    case "info":
    default:
      return <Info className="size-6 text-brand" aria-hidden="true" />;
  }
}

/**
 * A single notification. `success` shows the happy Galet, `error` the worried one.
 * Usually created through `useToast()` rather than rendered directly.
 */
export function Toast({ variant = "info", title, description, className, ...props }: ToastProps) {
  return (
    <ToastPrimitive.Root
      className={cn(
        "flex items-start gap-3 rounded-lg border border-rule bg-paper p-4 text-ink shadow-raised",
        "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]",
        "data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]",
        variant === "error" && "border-status-open",
        className,
      )}
      data-variant={variant}
      {...props}
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        <ToastIcon variant={variant} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <ToastPrimitive.Title className="text-ui font-semibold">{title}</ToastPrimitive.Title>
        {description ? (
          <ToastPrimitive.Description className="text-ui text-ink-2">
            {description}
          </ToastPrimitive.Description>
        ) : null}
      </div>
      <ToastPrimitive.Close
        className={cn(
          "-mt-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-2",
          "hover:bg-galet hover:text-ink",
          "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
        )}
        aria-label="Fermer la notification"
      >
        <X className="size-5" aria-hidden="true" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}
