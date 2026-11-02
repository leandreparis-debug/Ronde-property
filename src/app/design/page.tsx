import type { Metadata } from "next";
import Link from "next/link";

import { GALET_MOODS, GALET_MOOD_USAGE, Galet } from "@/components/brand/Galet";
import { Logo } from "@/components/brand/Logo";
import { Trail } from "@/components/brand/Trail";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime } from "@/lib/format";

import { DialogDemo } from "./_components/dialog-demo";
import { DesignSection, Specimen } from "./_components/section";
import { VisitTabsDemo } from "./_components/tabs-demo";
import { TextareaDemo } from "./_components/textarea-demo";
import { ToastDemo } from "./_components/toast-demo";
import {
  BRAND_TOKENS,
  type ColorToken,
  NEUTRAL_TOKENS,
  RADIUS_TOKENS,
  STATUS_TOKENS,
  TYPE_SCALE,
} from "./_components/tokens";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

const SECTIONS = [
  { id: "colors", label: "Couleurs" },
  { id: "radii", label: "Rayons et ombre" },
  { id: "type", label: "Typographie" },
  { id: "galet", label: "Galet" },
  { id: "logo", label: "Logo" },
  { id: "trail", label: "Trail" },
  { id: "buttons", label: "Boutons" },
  { id: "forms", label: "Formulaires" },
  { id: "surfaces", label: "Surfaces et pastilles" },
  { id: "tabs", label: "Onglets" },
  { id: "overlays", label: "Dialogue et toasts" },
  { id: "states", label: "États" },
  { id: "visit", label: "Exemple de visite" },
] as const;

/** Fictitious data for the visit header example. Not a real site. */
const FAKE_VISIT = {
  siteCode: "LOG-118",
  siteName: "Entrepôt de Saint-Quentin-Fallavier (38)",
  motive: "Visite périodique",
  date: "2026-11-02T09:30:00+01:00",
  reserve: {
    code: "R-07",
    title: "Remplacer les butoirs des quais 14 et 15",
    priority: "Priorité haute",
    assignee: "Prestataire maintenance",
    dueDate: "2026-12-15",
  },
};

function ColorSwatches({ tokens }: { tokens: ColorToken[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tokens.map((token) => (
        <li
          key={token.name}
          className="flex items-center gap-3 rounded-lg border border-rule bg-paper p-3"
        >
          <span
            className={cn(
              "flex size-14 shrink-0 items-center justify-center rounded-md border border-rule text-ui font-bold",
              token.swatch,
              token.onSwatch,
            )}
            aria-hidden="true"
          >
            {token.onSwatch ? "Aa" : null}
          </span>
          <span className="flex min-w-0 flex-col">
            <code className="truncate text-ui font-semibold text-ink">--color-{token.name}</code>
            <span className="text-ui text-ink-2">{token.value}</span>
            <span className="text-label text-ink-2">{token.usage}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Reference page of the RONDE design system: every token, the mascot, the logo and
 * each component in all its states. Not indexed; shows fictitious data only.
 */
export default function DesignPage() {
  return (
    <div className="min-h-dvh bg-craie text-ink">
      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex h-16 w-full max-w-content items-center justify-between gap-4 px-4 md:px-6">
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-md"
            aria-label="Retour à Mes visites"
          >
            <Logo size="sm" />
          </Link>
          <Badge variant="brand">Données fictives</Badge>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-content px-4 pb-16 md:px-6">
        <PageHeader
          eyebrow="Référence"
          title="Design system"
          actions={
            <Button asChild variant="secondary">
              <Link href="/">Mes visites</Link>
            </Button>
          }
        />
        <p className="max-w-2xl text-body text-ink-2">
          Cette page présente les fondations visuelles de RONDE. Toutes les données affichées sont
          fictives.
        </p>

        <nav aria-label="Sections de la page" className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-flex h-11 items-center rounded-pill border border-rule bg-paper px-4 text-ui font-semibold text-ink hover:bg-galet"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <DesignSection
          id="colors"
          title="Couleurs"
          description="Les couleurs de statut ne servent qu'aux statuts, toujours accompagnées d'un libellé. La couleur de marque n'indique jamais un statut."
        >
          <Specimen label="Marque" inline={false}>
            <ColorSwatches tokens={BRAND_TOKENS} />
          </Specimen>
          <Specimen label="Neutres" inline={false}>
            <ColorSwatches tokens={NEUTRAL_TOKENS} />
          </Specimen>
          <Specimen label="Statuts (texte / fond)" inline={false}>
            <ColorSwatches tokens={STATUS_TOKENS} />
          </Specimen>
        </DesignSection>

        <DesignSection
          id="radii"
          title="Rayons et ombre"
          description="Une seule ombre, --shadow-raised, réservée aux éléments flottants (dialogues, toasts)."
        >
          <Specimen label="Rayons">
            {RADIUS_TOKENS.map((radius) => (
              <div key={radius.name} className="flex flex-col items-center gap-2">
                <div
                  className={cn("size-20 border-2 border-brand bg-brand-soft", radius.className)}
                  aria-hidden="true"
                />
                <code className="text-ui font-semibold">--{radius.name}</code>
                <span className="text-label text-ink-2">
                  {radius.value} · {radius.usage}
                </span>
              </div>
            ))}
          </Specimen>
          <Specimen label="Ombre">
            <div className="rounded-lg bg-paper p-6 shadow-raised">
              <code className="text-ui font-semibold">--shadow-raised</code>
              <p className="text-ui text-ink-2">0 18px 40px rgb(0 0 0 / 0.12)</p>
            </div>
          </Specimen>
        </DesignSection>

        <DesignSection
          id="type"
          title="Typographie"
          description="Bricolage Grotesque 700 pour les titres et le logotype, Instrument Sans pour l'interface, Caveat pour les seules annotations manuscrites."
        >
          <ul className="flex flex-col divide-y divide-rule rounded-lg border border-rule bg-paper">
            {TYPE_SCALE.map((step) => (
              <li
                key={step.name}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-baseline sm:gap-6"
              >
                <span className="w-40 shrink-0 text-label text-ink-2">
                  {step.name} · {step.size}
                </span>
                <span className={cn("min-w-0 flex-1 text-ink", step.className)}>{step.sample}</span>
                <span className="text-ui text-ink-2 sm:w-64">{step.usage}</span>
              </li>
            ))}
            <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-baseline sm:gap-6">
              <span className="w-40 shrink-0 text-label text-ink-2">hand · 20 px</span>
              <span className="min-w-0 flex-1 font-hand text-title-sm text-ink-2">
                vérifier le quai 14
              </span>
              <span className="text-ui text-ink-2 sm:w-64">
                Annotations manuscrites uniquement, jamais pour une information indispensable
              </span>
            </li>
          </ul>
        </DesignSection>

        <DesignSection
          id="galet"
          title="Galet, la mascotte"
          description="Cinq humeurs, chacune liée à un état de l'application. Le galet ne se déforme pas, garde ses couleurs de tokens et ne signale jamais un statut."
        >
          <ul
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
            data-testid="galet-moods"
          >
            {GALET_MOODS.map((mood) => (
              <li
                key={mood}
                className="flex flex-col items-center gap-3 rounded-lg border border-rule bg-paper p-5 text-center"
              >
                <Galet mood={mood} size={88} label={`Galet ${mood}`} blink />
                <code className="text-ui font-semibold">{mood}</code>
                <span className="text-ui text-ink-2">{GALET_MOOD_USAGE[mood]}</span>
              </li>
            ))}
          </ul>
          <Specimen label="Tailles">
            <Galet size={24} />
            <Galet size={34} />
            <Galet size={48} />
            <Galet size={88} />
          </Specimen>
        </DesignSection>

        <DesignSection
          id="logo"
          title="Logo"
          description="Galet neutre et logotype « ronde » en Bricolage Grotesque."
        >
          <Specimen label="Couleur, trois tailles">
            <div className="flex flex-wrap items-end gap-8 rounded-lg border border-rule bg-paper p-6">
              <Logo size="sm" />
              <Logo size="md" />
              <Logo size="lg" />
            </div>
          </Specimen>
          <Specimen label="Mono sur fond ink">
            <div className="flex flex-wrap items-end gap-8 rounded-lg bg-ink p-6">
              <Logo size="md" tone="mono-light" />
              <Logo size="md" tone="mono-light" showWordmark={false} />
            </div>
          </Specimen>
          <Specimen label="Favicon">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation needed */}
            <img
              src="/icon.svg"
              alt="Favicon RONDE"
              width={64}
              height={64}
              className="rounded-md border border-rule"
            />
          </Specimen>
        </DesignSection>

        <DesignSection
          id="trail"
          title="Trail, le trait de la ronde"
          description="Décoratif. Réservé aux grands états vides et à cette page, jamais aux écrans de saisie."
        >
          <div className="flex justify-center rounded-lg border border-rule bg-brand-tint p-8">
            <Trail width={360} />
          </div>
        </DesignSection>

        <DesignSection
          id="buttons"
          title="Boutons"
          description="44 px de haut en md, 52 px en lg. danger est réservé aux suppressions."
        >
          <Specimen label="Variantes">
            <Button>Primaire</Button>
            <Button variant="secondary">Secondaire</Button>
            <Button variant="ghost">Discret</Button>
            <Button variant="danger">Supprimer</Button>
          </Specimen>
          <Specimen label="Taille lg (actions principales)">
            <Button size="lg">Nouvelle visite</Button>
            <Button size="lg" variant="secondary">
              Enregistrer
            </Button>
          </Specimen>
          <Specimen label="Désactivé">
            <Button disabled>Primaire</Button>
            <Button variant="secondary" disabled>
              Secondaire
            </Button>
            <Button variant="ghost" disabled>
              Discret
            </Button>
            <Button variant="danger" disabled>
              Supprimer
            </Button>
          </Specimen>
          <Specimen label="Chargement (aria-busy)">
            <Button loading>Génération du rapport</Button>
            <Button variant="secondary" loading>
              Synchronisation
            </Button>
          </Specimen>
          <Specimen label="asChild (lien stylé en bouton)">
            <Button asChild variant="secondary">
              <Link href="/reserves">Voir mes réserves</Link>
            </Button>
          </Specimen>
        </DesignSection>

        <DesignSection
          id="forms"
          title="Formulaires"
          description="Le message d'erreur est relié au champ par aria-describedby, avec une icône et un texte."
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Field id="demo-site" label="Site" hint="Code VIGIE, par exemple LOG-118." required>
              {(control) => <Input {...control} placeholder="LOG-118" />}
            </Field>
            <Field id="demo-filled" label="Motif de la visite">
              {(control) => <Input {...control} defaultValue="Visite périodique" />}
            </Field>
            <Field
              id="demo-error"
              label="Échéance"
              error="La date doit être postérieure à la visite."
            >
              {(control) => <Input {...control} type="date" defaultValue="2026-10-01" />}
            </Field>
            <Field id="demo-disabled" label="Créée par">
              {(control) => <Input {...control} value="Responsable technique" disabled readOnly />}
            </Field>
            <Field id="demo-select" label="Priorité">
              {(control) => (
                <Select {...control} defaultValue="high">
                  <option value="low">Basse</option>
                  <option value="medium">Moyenne</option>
                  <option value="high">Haute</option>
                </Select>
              )}
            </Field>
            <Field id="demo-select-error" label="Prestataire" error="Choisissez un prestataire.">
              {(control) => (
                <Select {...control} defaultValue="">
                  <option value="">—</option>
                  <option value="maintenance">Prestataire maintenance</option>
                </Select>
              )}
            </Field>
            <TextareaDemo />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="demo-label-only">Label seul</Label>
              <Input id="demo-label-only" placeholder="Champ sans aide" />
            </div>
          </div>
        </DesignSection>

        <DesignSection id="surfaces" title="Surfaces et pastilles">
          <Specimen label="Card" inline={false}>
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle>Zone 3 · Quais</CardTitle>
                <CardDescription>4 notes, 2 photos, 1 réserve</CardDescription>
              </CardHeader>
              <CardContent className="text-body text-ink-2">
                Fond paper, bordure rule, rayon lg, sans ombre.
              </CardContent>
            </Card>
          </Specimen>
          <Specimen label="Badge">
            <Badge>12 notes</Badge>
            <Badge variant="brand">Nouveau</Badge>
          </Specimen>
          <Specimen label="StatusPill (point et libellé toujours présents)">
            <StatusPill status="open" />
            <StatusPill status="in_progress" />
            <StatusPill status="done" />
            <StatusPill status="open" overdue />
            <StatusPill status="in_progress" overdue />
          </Specimen>
        </DesignSection>

        <DesignSection
          id="tabs"
          title="Onglets"
          description="Les onglets d'une visite défilent horizontalement si la largeur manque."
        >
          <Card className="p-5">
            <VisitTabsDemo />
          </Card>
        </DesignSection>

        <DesignSection
          id="overlays"
          title="Dialogue et toasts"
          description="Les confirmations passent par un dialogue, jamais par window.confirm."
        >
          <Specimen label="Dialog de confirmation">
            <DialogDemo />
          </Specimen>
          <Specimen label="Toasts">
            <ToastDemo />
          </Specimen>
        </DesignSection>

        <DesignSection id="states" title="États vides et chargements">
          <Specimen label="EmptyState" inline={false}>
            <Card>
              <EmptyState
                title="Aucune réserve à suivre"
                description="Les réserves relevées pendant vos visites seront regroupées ici."
                action={<Button variant="secondary">Créer une réserve</Button>}
              />
            </Card>
          </Specimen>
          <Specimen label="EmptyState, autres humeurs">
            <Card className="flex-1">
              <EmptyState
                mood="worried"
                title="Hors réseau"
                description="Vos saisies seront envoyées au retour de la connexion."
              />
            </Card>
            <Card className="flex-1">
              <EmptyState
                mood="happy"
                title="Rapport généré"
                description="Le PDF est prêt à être partagé."
              />
            </Card>
          </Specimen>
          <Specimen label="Skeleton" inline={false}>
            <Card className="flex max-w-md flex-col gap-3 p-5">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-7 w-20 rounded-pill" />
                <Skeleton className="h-7 w-24 rounded-pill" />
              </div>
            </Card>
          </Specimen>
        </DesignSection>

        <DesignSection
          id="visit"
          title="Exemple d'en-tête de visite"
          description="Données fictives : ce site et cette réserve n'existent pas."
        >
          <Card className="overflow-hidden">
            <div className="bg-brand-tint px-5 pt-5 pb-0 sm:px-6">
              <PageHeader
                className="py-0 pb-5"
                eyebrow={`${FAKE_VISIT.siteCode} · ${FAKE_VISIT.siteName}`}
                title={FAKE_VISIT.motive}
                actions={
                  <>
                    <Badge>{formatDate(FAKE_VISIT.date, "long")}</Badge>
                    <Button variant="secondary">Rapport PDF</Button>
                  </>
                }
              />
              <VisitTabsDemo />
            </div>
            <CardContent className="p-5 sm:p-6">
              <h3 className="font-display text-title-sm">Réserves</h3>
              <ul className="mt-3">
                <li className="flex flex-col gap-3 rounded-md border border-rule bg-paper p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-body font-semibold text-ink">
                      <span className="text-ink-2">{FAKE_VISIT.reserve.code}</span>{" "}
                      {FAKE_VISIT.reserve.title}
                    </p>
                    <p className="text-ui text-ink-2">
                      {FAKE_VISIT.reserve.priority} · {FAKE_VISIT.reserve.assignee} · Échéance{" "}
                      {formatDate(FAKE_VISIT.reserve.dueDate)}
                    </p>
                    <p className="text-label text-ink-2">
                      Dernière mise à jour {formatDateTime(FAKE_VISIT.date)}
                    </p>
                  </div>
                  <StatusPill status="open" overdue className="shrink-0" />
                </li>
              </ul>
            </CardContent>
          </Card>
        </DesignSection>
      </main>
    </div>
  );
}
