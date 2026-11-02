import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Galet } from "@/components/brand/Galet";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Card } from "@/components/ui/card";
import { getCurrentUser, safeNext } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Connexion",
};

/** Email and password sign-in. Already signed-in users are sent to the application. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = safeNext(Array.isArray(params.next) ? params.next[0] : params.next);

  const user = await getCurrentUser();
  if (user) redirect(next);

  return (
    <Card className="p-6 md:p-8">
      <div className="mb-6 flex items-center gap-4">
        <Galet mood="neutral" size={56} blink />
        <div>
          <h1 className="font-display text-title">Connexion</h1>
          <p className="text-ui text-ink-2">
            Accès réservé aux comptes créés par l&apos;administrateur.
          </p>
        </div>
      </div>
      <SignInForm next={next} />
    </Card>
  );
}
