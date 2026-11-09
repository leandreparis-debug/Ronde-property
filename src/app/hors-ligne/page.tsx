import type { Metadata } from "next";
import Link from "next/link";

import { Galet } from "@/components/brand/Galet";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Hors connexion" };

/**
 * What RONDE does without network (step 12). Public and static (no data, no session): it stays
 * readable whatever the state of the account, and the service worker serves it offline for a
 * page that is not kept on the device (see docs/pwa.md and docs/offline.md).
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
          RONDE continue de fonctionner sans réseau pour les visites gardées sur cet appareil. Vos
          saisies y sont enregistrées et partent d&apos;elles-mêmes au retour du réseau.
        </p>
        <section className="w-full rounded-lg border border-rule bg-paper p-5">
          <h2 className="font-display text-title-sm font-bold">Pendant une coupure</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <strong>Visites gardées hors réseau</strong> : elles s&apos;ouvrent, même après avoir
              rechargé la page ou rouvert l&apos;application. Touchez « Garder hors réseau » sur une
              visite avant de partir (automatique sur tablette).
            </li>
            <li>
              <strong>Notes, informations, participants, photos, repères et réserves</strong> : tout
              est enregistré sur l&apos;appareil. Une réserve créée hors réseau s&apos;affiche « R-?
              » jusqu&apos;à ce que le serveur lui donne son numéro.
            </li>
            <li>
              <strong>Envoi</strong> : au retour du réseau, au retour sur l&apos;application, ou en
              touchant « Synchroniser maintenant ». En cas d&apos;échec, nouvelle tentative après 1
              s, puis à intervalle doublé, jusqu&apos;à toutes les 5 min.
            </li>
            <li>
              <strong>Réservé au réseau</strong> : créer une visite, importer un plan, générer le
              rapport, terminer la visite.
            </li>
          </ul>
        </section>
        <section className="w-full rounded-lg border border-rule bg-paper p-5">
          <h2 className="font-display text-title-sm font-bold">À savoir</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              Le Galet en haut de l&apos;écran indique l&apos;état : endormi hors réseau, attentif
              pendant l&apos;envoi, souriant quand tout est à jour, inquiet s&apos;il faut arbitrer.
            </li>
            <li>
              Si une même note a été modifiée ailleurs, rien n&apos;est écrasé : les deux versions
              vous sont présentées dans « À arbitrer ».
            </li>
            <li>Se déconnecter efface la copie de l&apos;appareil : synchronisez d&apos;abord.</li>
          </ul>
        </section>
        <Button asChild size="lg">
          <Link href="/">Mes visites</Link>
        </Button>
      </main>
    </div>
  );
}
