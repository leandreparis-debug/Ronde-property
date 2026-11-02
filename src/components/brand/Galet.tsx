import type { SVGProps } from "react";

/** The five moods of the mascot. Each one maps to an application state (see docs/design-system.md). */
export const GALET_MOODS = ["neutral", "attentive", "worried", "happy", "asleep"] as const;

export type GaletMood = (typeof GALET_MOODS)[number];

/** Application state each mood stands for. Used by the design page and the documentation. */
export const GALET_MOOD_USAGE: Record<GaletMood, string> = {
  neutral: "Logo, accueil, en-têtes",
  attentive: "Chargement, synchronisation",
  worried: "Erreur, réserve en retard",
  happy: "Succès (réserve levée, rapport généré)",
  asleep: "État vide, hors réseau",
};

export interface GaletProps extends Omit<SVGProps<SVGSVGElement>, "color"> {
  /** Mood of the mascot. Unknown values fall back to `neutral`. */
  mood?: GaletMood | (string & {});
  /** Rendered size in pixels (the drawing is square). */
  size?: number;
  /** Body colour. Must be a token; defaults to the brand colour. */
  color?: string;
  /** Eye colour. Defaults to white (`on-brand`). */
  eyeColor?: string;
  /**
   * Accessible name. When provided the mascot is exposed as an image with this label;
   * otherwise it is purely decorative and hidden from assistive technologies.
   */
  label?: string;
  /** Blink every ~6 s (neutral and attentive only). Disabled by `prefers-reduced-motion`. */
  blink?: boolean;
}

/** Body outline of the pebble, shared by every mood. */
export const GALET_BODY_PATH = "M8 92 C 2 62, 16 26, 50 22 C 82 18, 98 48, 94 92 Z";

function isGaletMood(value: string): value is GaletMood {
  return (GALET_MOODS as readonly string[]).includes(value);
}

/**
 * Normalises any runtime value to a known mood, falling back to `neutral`.
 * External data (step 9 and later) may carry unexpected values: the mascot must never crash.
 */
export function resolveGaletMood(value: unknown): GaletMood {
  return typeof value === "string" && isGaletMood(value) ? value : "neutral";
}

/**
 * « Galet », the RONDE mascot: a pebble looking to the right.
 * Pure SVG, no dependency, usable from server and client components.
 *
 * @example
 * <Galet mood="asleep" size={96} label="Galet endormi" />
 */
export function Galet({
  mood = "neutral",
  size = 48,
  color = "var(--color-brand)",
  eyeColor = "var(--color-on-brand)",
  label,
  blink = false,
  className,
  ...rest
}: GaletProps) {
  const resolved = resolveGaletMood(mood);
  const canBlink = blink && (resolved === "neutral" || resolved === "attentive");
  const a11y = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const };

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      data-mood={resolved}
      focusable="false"
      {...a11y}
      {...rest}
    >
      <path d={GALET_BODY_PATH} fill={color} />
      <g className={canBlink ? "galet-blink" : undefined} fill={eyeColor}>
        <GaletEyes mood={resolved} eyeColor={eyeColor} />
      </g>
    </svg>
  );
}

function GaletEyes({ mood, eyeColor }: { mood: GaletMood; eyeColor: string }) {
  switch (mood) {
    case "attentive":
      return (
        <>
          <circle cx="62" cy="48" r="6" />
          <circle cx="80" cy="48" r="6" />
        </>
      );
    case "worried":
      return (
        <>
          <circle cx="58" cy="57" r="5.5" />
          <circle cx="76" cy="57" r="5.5" />
          <path
            d="M51 47 l12 -4 M83 47 l-12 -4"
            fill="none"
            stroke={eyeColor}
            strokeWidth="4"
            strokeLinecap="round"
          />
        </>
      );
    case "happy":
      return (
        <path
          d="M51 56 q7 -9 14 0 M69 56 q7 -9 14 0"
          fill="none"
          stroke={eyeColor}
          strokeWidth="5"
          strokeLinecap="round"
        />
      );
    case "asleep":
      return (
        <>
          <path
            d="M52 56 h12 M70 56 h12"
            fill="none"
            stroke={eyeColor}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <text
            x="84"
            y="32"
            fill="var(--color-ink-2)"
            fontFamily="var(--font-hand)"
            fontWeight="700"
            fontSize="22"
            textAnchor="middle"
          >
            z
          </text>
        </>
      );
    case "neutral":
    default:
      return (
        <>
          <circle cx="58" cy="54" r="6" />
          <circle cx="76" cy="54" r="6" />
        </>
      );
  }
}
