import type { ReactNode } from "react";

import { ToastProvider } from "@/components/ui/toast";

import { BottomNav } from "./bottom-nav";
import { SideNav } from "./side-nav";
import { TopBar } from "./top-bar";

/**
 * Application frame. Side navigation from 1024 px, top bar and bottom navigation below.
 * Content is limited to 1200 px with 16 px side margins (24 px from 768 px).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-dvh bg-craie text-ink">
        <SideNav />
        <TopBar />
        <div className="lg:pl-sidenav">
          <main
            id="main"
            className="mx-auto w-full max-w-content px-4 pb-[calc(var(--spacing-bottomnav)+env(safe-area-inset-bottom,0px)+1.5rem)] md:px-6 lg:pb-10"
          >
            {children}
          </main>
        </div>
        <BottomNav />
      </div>
    </ToastProvider>
  );
}
