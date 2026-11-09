"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";

import { replaceQuery } from "@/lib/offline/query";

/**
 * Link to another tab or filter of the **same page** (`href="?onglet=…"`): the query changes
 * without a server round trip, so it works offline. A modified click (new tab, new window)
 * keeps the browser behaviour.
 */
export function QueryLink({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  function click(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    if (!href.startsWith("?")) return;
    event.preventDefault();
    replaceQuery(href.slice(1));
  }
  return <a href={href} onClick={click} {...props} />;
}
