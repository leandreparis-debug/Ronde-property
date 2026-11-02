"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react";

import { cn } from "@/lib/cn";

/** Tabs root (Radix). Controlled or uncontrolled through `value` / `defaultValue`. */
export const Tabs = TabsPrimitive.Root;

/**
 * Row of tab triggers. Scrolls horizontally when the tabs do not fit, which happens
 * on a tablet in portrait with the six visit tabs.
 */
export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "flex w-full snap-x items-stretch gap-1 overflow-x-auto border-b border-rule",
        "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
});

/** A single tab. Active tab: brand text and underline. */
export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "relative inline-flex h-11 shrink-0 snap-start items-center justify-center px-3.5 text-ui font-semibold whitespace-nowrap text-ink-2",
        "-mb-px border-b-2 border-transparent transition-colors",
        "hover:text-ink",
        "focus-visible:rounded-sm focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-brand",
        "data-[state=active]:border-brand data-[state=active]:text-brand-deep",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

/** Panel associated with a tab. */
export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn("pt-4 focus-visible:outline-3 focus-visible:outline-brand", className)}
      {...props}
    />
  );
});
