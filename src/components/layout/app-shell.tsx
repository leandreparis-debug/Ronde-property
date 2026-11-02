import { type ReactNode, Suspense } from "react";

import { ToastProvider } from "@/components/ui/toast";
import type { CurrentUser } from "@/server/auth/types";

import { BottomNav } from "./bottom-nav";
import { FlashToast } from "./flash-toast";
import { SideNav } from "./side-nav";
import { TopBar } from "./top-bar";

/**
 * Application frame for a signed-in user. Side navigation from 1024 px, top bar and bottom
 * navigation below. Content is limited to 1200 px with 16 px side margins (24 px from 768 px).
 */
export function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <FlashToast />
      </Suspense>
      <div className="min-h-dvh bg-craie text-ink">
        <SideNav user={user} />
        <TopBar user={user} />
        <div className="lg:pl-sidenav">
          <main
            id="main"
            className="mx-auto w-full max-w-content px-4 pb-[calc(var(--spacing-bottomnav)+env(safe-area-inset-bottom,0px)+1.5rem)] md:px-6 lg:pb-10"
          >
            {children}
          </main>
        </div>
        <BottomNav user={user} />
      </div>
    </ToastProvider>
  );
}
