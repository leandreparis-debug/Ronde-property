"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface NavLinkProps {
  href: string;
  /** Path prefix that marks the link current (defaults to `href`). */
  match?: string;
  className?: string;
  activeClassName?: string;
  children: ReactNode;
}

/** Whether `pathname` is `prefix` or one of its sub-routes. */
export function isActivePath(pathname: string, prefix: string): boolean {
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Navigation link that marks itself as the current page (`aria-current="page"`).
 */
export function NavLink({ href, match, className, activeClassName, children }: NavLinkProps) {
  const pathname = usePathname();
  const active = isActivePath(pathname, match ?? href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(className, active && activeClassName)}
    >
      {children}
    </Link>
  );
}
