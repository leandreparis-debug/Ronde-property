import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
