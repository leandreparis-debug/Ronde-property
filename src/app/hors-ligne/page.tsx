import type { Metadata } from "next";
import Link from "next/link";

import { Galet } from "@/components/brand/Galet";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Hors connexion" };

/**
 * What RONDE does without network in phase 1. Public and static (no data, no session): it
 * stays readable whatever the state of the account, and is the page a service worker will
 * serve offline from step 12 (see docs/pwa.md).
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-craie px-4 py-8 text-ink">
      <Link href="/" className="inline-flex h-11 items-center rounded-md px-2">
        <Logo size="md" />
      </Link>
      <main id="main" className="flex w-full max-w-xl flex-1 flex-col items-center gap-6 py-10">
        <Galet mood="asleep" size={88} />
        <h1 className="text-center font-display text-title font-bold">Hors connexion</h1>
        <p className="text-center text-ink-2">
          RONDE a besoin du réseau pour ouvrir une page. Une page déjà ouverte continue de
          fonctionner pendant une coupure, avec les limites ci-dessous.
        </p>
        <section className="w-full rounded-lg border border-rule bg-paper p-5">
          <h2 className="font-display text-title-sm font-bold">Pendant une coupure</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <strong>Notes</strong> : le texte reste sur la page et s&apos;enregistre de lui-même
              au retour du réseau (nouvelle tentative après 1 s, 2 s, 5 s, 10 s, puis toutes les 30
              s).
            </li>
            <li>
              <strong>Photos</strong> : chaque envoi est réessayé trois fois (1 s, 3 s, 10 s), puis
              la photo attend que vous touchiez « Réessayer ».
            </li>
            <li>
              <strong>Réserves et informations de la visite</strong> : l&apos;enregistrement échoue
              avec le message « Hors connexion » ; la saisie reste dans le formulaire, enregistrez à
              nouveau au retour du réseau.
            </li>
            <li>
              <strong>Autres actions</strong> (participants, plans, rapport) : refaites-les au
              retour du réseau.
            </li>
          </ul>
        </section>
        <section className="w-full rounded-lg border border-rule bg-paper p-5">
          <h2 className="font-display text-title-sm font-bold">À savoir</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              Gardez la page ouverte : ce qui attend le réseau est gardé en mémoire et serait perdu
              si l&apos;onglet était fermé (le navigateur vous prévient).
            </li>
            <li>Le travail hors connexion complet est prévu à l&apos;étape suivante.</li>
          </ul>
        </section>
        <Button asChild size="lg">
          <Link href="/">Mes visites</Link>
        </Button>
      </main>
    </div>
  );
}
