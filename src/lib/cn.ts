import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge must know the RONDE type scale, otherwise `text-body` would be read
 * as a colour and would discard a `text-on-brand` placed before it.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["label", "ui", "body", "title-sm", "title", "display"] }],
    },
  },
});

/**
 * Joins class names conditionally and resolves Tailwind conflicts
 * (the last utility of a given group wins).
 *
 * @example
 * cn("px-2 py-1", isActive && "bg-brand", "px-4") // → "py-1 bg-brand px-4"
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
