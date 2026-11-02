import { cn } from "@/lib/cn";

import { Galet } from "./Galet";

export type LogoSize = "sm" | "md" | "lg";
export type LogoTone = "color" | "mono-light";

const GALET_SIZE: Record<LogoSize, number> = { sm: 24, md: 34, lg: 54 };
const WORDMARK_CLASS: Record<LogoSize, string> = {
  sm: "text-[20px] leading-none",
  md: "text-[28px] leading-none",
  lg: "text-[44px] leading-none",
};

export interface LogoProps {
  /** `sm` 24 px, `md` 34 px, `lg` 54 px (height of the mascot). */
  size?: LogoSize;
  /** Show the « ronde » wordmark next to the mascot. */
  showWordmark?: boolean;
  /** `color` on light backgrounds, `mono-light` on dark backgrounds. */
  tone?: LogoTone;
  className?: string;
}

/**
 * RONDE logo: the neutral Galet followed by the lowercase « ronde » wordmark
 * (Bricolage Grotesque 700, −0.045em). The gap is about 0.2 × the mascot size.
 */
export function Logo({ size = "md", showWordmark = true, tone = "color", className }: LogoProps) {
  const px = GALET_SIZE[size];
  const mono = tone === "mono-light";

  return (
    <span
      className={cn("inline-flex items-center", className)}
      style={{ gap: Math.round(px * 0.2) }}
      data-tone={tone}
    >
      <Galet
        mood="neutral"
        size={px}
        color={mono ? "var(--color-craie)" : "var(--color-brand)"}
        eyeColor={mono ? "var(--color-ink)" : "var(--color-on-brand)"}
        label={showWordmark ? undefined : "RONDE"}
      />
      {showWordmark ? (
        <span
          className={cn(
            "font-display tracking-[-0.045em]",
            mono ? "text-craie" : "text-ink",
            WORDMARK_CLASS[size],
          )}
          translate="no"
        >
          ronde
        </span>
      ) : null}
    </span>
  );
}
