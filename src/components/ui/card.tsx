import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * Flat surface: paper background, rule border, large radius, no shadow.
 */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn("rounded-lg border border-rule bg-paper text-ink", className)}
      {...props}
    />
  );
});

/** Top area of a card: title and optional description. */
export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn("flex flex-col gap-1 p-5", className)} {...props} />;
  },
);

/** Card title (section size). */
export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return <h3 ref={ref} className={cn("font-display text-title-sm", className)} {...props} />;
  },
);

/** Secondary text under the card title. */
export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn("text-ui text-ink-2", className)} {...props} />;
});

/** Main body of a card. */
export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />;
  },
);

/** Bottom area of a card, usually actions. */
export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div ref={ref} className={cn("flex items-center gap-2 p-5 pt-0", className)} {...props} />
    );
  },
);
