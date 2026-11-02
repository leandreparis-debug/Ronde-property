import Link from "next/link";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** 403: rendered by `forbidden()` when the user's role does not allow the page. */
export default function Forbidden() {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-craie px-4 py-8 text-ink">
      <Link href="/" className="inline-flex h-11 items-center rounded-md px-2">
        <Logo size="md" />
      </Link>
      <main className="flex flex-1 items-center">
        <EmptyState
          mood="worried"
          title="Vous n'avez pas accès à cette page"
          description="Votre rôle ne permet pas de consulter cette section."
          action={
            <Button asChild size="lg">
              <Link href="/">Retour à l&apos;accueil</Link>
            </Button>
          }
        />
      </main>
    </div>
  );
}
