import Link from "next/link";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Custom 404: the worried Galet and a way back to « Mes visites ».
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-craie px-4 py-8 text-ink">
      <Link href="/" className="inline-flex h-11 items-center rounded-md px-2">
        <Logo size="md" />
      </Link>
      <main className="flex flex-1 items-center">
        <EmptyState
          mood="worried"
          title="Cette page n'existe pas"
          description="L'adresse est peut-être erronée ou la page a été déplacée."
          action={
            <Button asChild size="lg">
              <Link href="/">Mes visites</Link>
            </Button>
          }
        />
      </main>
    </div>
  );
}
