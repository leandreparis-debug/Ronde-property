"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  forwardRef,
  type HTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

/** Dialog root (Radix). Use it for every confirmation: never `window.confirm`. */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

/** Dimmed backdrop behind the dialog. */
export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-ink/50",
        "motion-safe:data-[state=open]:animate-fade-in",
        className,
      )}
      {...props}
    />
  );
});

export interface DialogContentProps extends ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  /** Hide the top-right close button (keep it unless the dialog offers its own cancel action). */
  hideCloseButton?: boolean;
}

/**
 * Dialog panel: paper surface, raised shadow, centred, 44 px close button.
 * Always include a <DialogTitle>; add a <DialogDescription> or `aria-describedby={undefined}`.
 */
export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(function DialogContent({ className, children, hideCloseButton = false, ...props }, ref) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4",
          "rounded-xl bg-paper p-6 text-ink shadow-raised",
          "focus:outline-none motion-safe:data-[state=open]:animate-pop-in",
          className,
        )}
        {...props}
      >
        {children}
        {hideCloseButton ? null : (
          <DialogPrimitive.Close
            className={cn(
              "absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-md text-ink-2",
              "hover:bg-galet hover:text-ink",
              "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
            )}
          >
            <X className="size-5" aria-hidden="true" />
            <span className="sr-only">Fermer</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

/** Title and description block. */
export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 pr-11", className)} {...props} />;
}

/** Action row, stacked on narrow screens and right-aligned otherwise. */
export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn("font-display text-title-sm", className)}
      {...props}
    />
  );
});

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-body text-ink-2", className)}
      {...props}
    />
  );
});
