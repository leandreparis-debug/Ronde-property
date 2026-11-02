import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";
import { ToastProvider } from "@/components/ui/toast";

/** Centred layout of the sign-in and password screens, outside the application shell. */
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col items-center bg-craie px-4 py-8 text-ink md:py-12">
        <Logo size="lg" />
        <main id="main" className="flex w-full max-w-md flex-1 flex-col justify-center py-8">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
