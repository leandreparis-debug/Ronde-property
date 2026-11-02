import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface DesignSectionProps {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}

/** A titled, anchorable section of the design page. */
export function DesignSection({ id, title, description, children }: DesignSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 py-10">
      <h2 id={`${id}-title`} className="font-display text-title text-ink">
        {title}
      </h2>
      {description ? <p className="mt-1 max-w-2xl text-body text-ink-2">{description}</p> : null}
      <div className="mt-6 flex flex-col gap-6">{children}</div>
    </section>
  );
}

/** A labelled specimen inside a section. */
export function Specimen({
  label,
  children,
  className,
  inline = true,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  inline?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <p className="label-caps text-ink-2">{label}</p>
      <div className={cn(inline ? "flex flex-wrap items-center gap-3" : "flex flex-col gap-3")}>
        {children}
      </div>
    </div>
  );
}
