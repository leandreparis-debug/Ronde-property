# Design system RONDE

Référence vivante : la page `/design` de l'application montre chaque élément ci-dessous.
Thème clair uniquement en V1.

## Principes

- **Tactile d'abord** : zones cliquables de 44 × 44 px minimum, 48 px pour les actions
  principales ; aucune interaction réservée au survol ; focus clavier visible (anneau `brand`).
- **Les couleurs passent par les tokens.** La palette Tailwind par défaut est désactivée dans
  `globals.css` : seules les classes dérivées des tokens existent (`bg-brand`, `text-ink-2`…).
- **Un statut est toujours accompagné de son libellé.** Les couleurs de statut ne servent
  qu'aux statuts ; la couleur de marque n'indique jamais un statut.
- Textes en français, code en anglais.

## Tokens de couleur (`src/app/globals.css`, bloc `@theme`)

| Token                                                    | Valeur                | Usage                                                           |
| -------------------------------------------------------- | --------------------- | --------------------------------------------------------------- |
| `--color-brand`                                          | `#2F6AFF`             | mascotte, action principale, onglet actif (voir note contraste) |
| `--color-brand-deep`                                     | `#1B45C9`             | texte sur `brand-soft`, survol / appui                          |
| `--color-brand-soft`                                     | `#E7EEFF`             | pastilles et fonds légers de marque                             |
| `--color-brand-tint`                                     | `#F4F7FF`             | grands fonds de marque (bandeaux, plan)                         |
| `--color-on-brand`                                       | `#FFFFFF`             | texte sur `brand`                                               |
| `--color-ink`                                            | `#121317`             | texte principal (« basalte »)                                   |
| `--color-ink-2`                                          | `#5C606B`             | texte secondaire                                                |
| `--color-paper`                                          | `#FFFFFF`             | cartes, panneaux                                                |
| `--color-craie`                                          | `#F6F6F4`             | fond de l'application                                           |
| `--color-galet`                                          | `#E9E9E6`             | pastilles neutres, compteurs                                    |
| `--color-rule`                                           | `#E4E4E0`             | bordures, séparateurs                                           |
| `--color-status-open` / `--color-status-open-bg`         | `#C0341F` / `#FDE4DE` | réserve **ouverte**, retard (texte)                             |
| `--color-status-open-dot`                                | `#D63A22`             | point de la pastille « Ouverte » / « En retard »                |
| `--color-status-progress` / `--color-status-progress-bg` | `#8F6200` / `#FFF0C7` | réserve **en cours**                                            |
| `--color-status-progress-dot`                            | `#E8A400`             | point de la pastille « En cours »                               |
| `--color-status-done` / `--color-status-done-bg`         | `#23704A` / `#DCF0E3` | réserve **levée**                                               |

**Note contraste (WCAG AA, 4,5:1 pour le texte de 14 px).** Deux valeurs de la charte ont été
ajustées au minimum : `brand` passe de `#2F6BFF` à `#2F6AFF` (blanc sur bleu : 4,49:1 → 4,54:1,
différence invisible) et le texte `status-open` passe de `#D63A22` à `#C0341F` (3,86:1 → 4,6:1
sur son fond, 5,2:1 sur `craie`). Le rouge d'origine `#D63A22` reste utilisé pour le point de la
pastille, comme `#E8A400` pour « En cours ».

## Rayons et ombre

| Token           | Valeur | Usage             |
| --------------- | ------ | ----------------- |
| `--radius-sm`   | 12px   | petits éléments   |
| `--radius-md`   | 14px   | boutons, champs   |
| `--radius-lg`   | 20px   | panneaux, cartes  |
| `--radius-xl`   | 24px   | cartes de section |
| `--radius-pill` | 999px  | pastilles         |

Une seule ombre, `--shadow-raised: 0 18px 40px rgb(0 0 0 / 0.12)`, réservée aux éléments
flottants (dialogues, toasts). Les cartes n'ont pas d'ombre.

## Typographie

Polices chargées par `next/font/google` et auto-hébergées au build (aucun CDN à l'exécution).

| Variable         | Police              | Graisse      | Usage                                                                    |
| ---------------- | ------------------- | ------------ | ------------------------------------------------------------------------ |
| `--font-display` | Bricolage Grotesque | 700, −0,04em | titres et logotype uniquement (classe `font-display`)                    |
| `--font-sans`    | Instrument Sans     | 400 à 700    | toute l'interface et le texte courant                                    |
| `--font-hand`    | Caveat              | 700          | annotations manuscrites uniquement, jamais une information indispensable |

Échelle (`text-*`) :

| Token                       | Taille | Usage                                           |
| --------------------------- | ------ | ----------------------------------------------- |
| `text-label` / `label-caps` | 12 px  | libellés en majuscules, `letter-spacing` 0,08em |
| `text-ui`                   | 14 px  | interface                                       |
| `text-body`                 | 16 px  | texte des notes                                 |
| `text-title-sm`             | 20 px  | titres de section (Bricolage)                   |
| `text-title`                | 28 px  | titres de page (Bricolage)                      |
| `text-display`              | 40 px  | grands titres (Bricolage)                       |

## Galet, la mascotte (`src/components/brand/Galet.tsx`)

SVG pur, `viewBox 0 0 100 100`, corps rempli avec `brand`, yeux blancs tournés vers la droite.

| Humeur      | Usage                                  |
| ----------- | -------------------------------------- |
| `neutral`   | logo, accueil, en-têtes                |
| `attentive` | chargement, synchronisation            |
| `worried`   | erreur, réserve en retard              |
| `happy`     | succès (réserve levée, rapport généré) |
| `asleep`    | état vide, hors réseau                 |

- Avec `label`, le galet est une image nommée (`role="img"`, `aria-label`) ; sans, il est
  décoratif (`aria-hidden`).
- `blink` fait cligner les yeux toutes les ~6 s pour `neutral` et `attentive` seulement ;
  désactivé par `prefers-reduced-motion`.
- Une humeur inconnue se replie sur `neutral` sans planter (`resolveGaletMood`).

**À ne pas faire** : déformer le galet (toujours carré, jamais étiré) ; changer sa couleur hors
tokens (`brand` par défaut, `craie` en mono sur fond sombre) ; l'utiliser pour signaler un
statut (une réserve en retard se signale par `StatusPill`, le galet `worried` n'accompagne que
les écrans d'erreur) ; ajouter des membres, accessoires ou un sourire hors des humeurs définies.

## Logo (`Logo.tsx`)

Galet `neutral` + logotype « ronde » en minuscules (Bricolage Grotesque 700, −0,045em, `ink`),
écart ≈ 0,2 × la taille. Tailles `sm` 24 / `md` 34 / `lg` 54. `tone="mono-light"` : galet
`craie`, yeux `ink`, pour les fonds sombres. `showWordmark={false}` garde le galet seul, nommé
« RONDE ».

Favicon (`src/app/icon.svg`) : carré arrondi blanc, galet `brand` montant du bas, deux yeux.

## Trail (`Trail.tsx`)

« Le trait de la ronde » : chemin continu à main levée en `brand` (trait 6,5, extrémités
rondes) avec points d'étape blancs cerclés de `brand`. Décoratif (`aria-hidden`), animé au
premier affichage (`stroke-dashoffset`), immobile si `prefers-reduced-motion`. Réservé aux
grands états vides et à `/design` ; jamais dans les écrans de saisie.

## Composants (`src/components/ui/`)

| Composant                                          | Points clés                                                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                           | `primary`, `secondary`, `ghost`, `danger` (suppressions) ; `md` 44 px, `lg` 52 px ; `loading` (spinner, `aria-busy`, désactivé) ; `asChild` |
| `Input`, `Textarea` (hauteur auto), `Select` natif | 44 px, bordure `rule`, erreur en `status-open` via `aria-invalid`                                                                           |
| `Label`                                            | mention « (obligatoire) » en toutes lettres                                                                                                 |
| `Field`                                            | label + champ + aide + erreur (icône et texte) reliés par `aria-describedby`                                                                |
| `Card`                                             | `paper`, bordure `rule`, `radius-lg`, sans ombre                                                                                            |
| `Badge`                                            | `neutral` (`galet`) ou `brand` (`brand-soft` / `brand-deep`) ; jamais pour un statut                                                        |
| `StatusPill`                                       | `open` « Ouverte », `in_progress` « En cours », `done` « Levée » ; `overdue` « En retard » en style `open` ; point + texte toujours         |
| `Tabs`                                             | Radix ; défilement horizontal si l'espace manque ; onglets de visite : Informations, Notes, Réserves, Photos, Plans, Rapport                |
| `Dialog`                                           | Radix ; toutes les confirmations ; jamais `window.confirm`                                                                                  |
| `Toast`                                            | Radix ; `success` (galet `happy`), `error` (galet `worried`), `info`                                                                        |
| `EmptyState`                                       | galet (`asleep` par défaut), titre, texte, action optionnelle, illustration optionnelle                                                     |
| `Skeleton`                                         | chargements                                                                                                                                 |

## Coquille (`src/components/layout/`)

- ≥ 1024 px : barre latérale fixe de 240 px (`paper`, bordure droite `rule`) avec `Logo`, liens
  « Mes visites » et « Mes réserves » (actif : `brand` / `on-brand`, `aria-current="page"`),
  zone compte factice.
- < 1024 px : barre du haut avec `Logo` et barre basse de 56 px + `env(safe-area-inset-bottom)`.
- Fond `craie`, contenu limité à 1200 px, marges de 16 px (24 px à partir de 768 px).
- `PageHeader` : surtitre 12 px majuscules, titre 28 px Bricolage, actions à droite qui passent
  sous le titre en dessous de 640 px.
