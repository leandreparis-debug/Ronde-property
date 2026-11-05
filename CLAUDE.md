# RONDE — consignes pour les sessions de développement

> **Règle absolue : Claude Code ne modifie jamais un environnement distant** : ni migration,
> ni écriture, ni `db push` sur un projet Supabase autre que la base locale `ronde_test`, même
> si des identifiants ou des connecteurs (MCP Supabase, MCP Vercel) sont disponibles. Les
> migrations distantes sont appliquées par Léandre selon `docs/deploy.md`. Si une tâche semble
> exiger une action distante, **s'arrêter** et le signaler dans le récapitulatif.

## Projet

RONDE est l'application des visites de site des Responsables Techniques (RT) de Carrefour
Property : préparer, mener et suivre chaque visite d'entrepôt, jusqu'à la levée des réserves.
Elle remplace l'outil interne « CR Visites » (aucun code repris).

Utilisateurs : **RT** (saisie sur tablette au doigt et sur PC), **Direction** (lecture seule),
**Admin** (gestion des comptes).

Étapes : 1 fondations et design system (faite) · 2 modèle de données Supabase et RLS (faite) ·
3 authentification, rôles, audit (faite) · 4 référentiel des sites (CSV VIGIE, faite) · 5 visites (faite) · 6 notes
par zone (faite) · 7 photos (faite) · 8 plans AutoCAD et repères (faite) · 9 réserves (faite) · 10 rapport PDF (faite) · 11 recette et
déploiement.

## Stack et versions (exactes, pas de `^`)

- Next.js 15.5.28, App Router, dossier `src/` · React 19.3.1 · TypeScript 5.9.3 strict avec
  `noUncheckedIndexedAccess`.
- Tailwind CSS 4.3.3 en configuration CSS-first (`@theme` dans `src/app/globals.css`, pas de
  `tailwind.config.js`).
- Node 22, pnpm 10 (`packageManager` dans `package.json`).
- lucide-react, clsx + tailwind-merge (`cn`), class-variance-authority, Radix (dialog, tabs,
  slot, toast), zod, react-hook-form 7.90.0 + @hookform/resolvers 5.9.1 (formulaires de
  réserve), @react-pdf/renderer 4.9.0 (rapport, navigateur uniquement).
- Qualité : ESLint 9 (config Next + TypeScript), Prettier 3, Vitest 4 + Testing Library + jsdom,
  Playwright 1.63 + @axe-core/playwright.
- V1 hébergée sur Vercel + Supabase ; V2 sur serveur interne.

## Commandes

| Commande                  | Rôle                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm dev`                | serveur de développement                                                           |
| `pnpm build`              | build de production                                                                |
| `pnpm start`              | serveur de production                                                              |
| `pnpm lint`               | ESLint, zéro avertissement toléré                                                  |
| `pnpm format`             | Prettier (écriture)                                                                |
| `pnpm format:check`       | Prettier (vérification)                                                            |
| `pnpm typecheck`          | `tsc --noEmit`                                                                     |
| `pnpm test`               | tests unitaires Vitest                                                             |
| `pnpm test:e2e`           | tests Playwright sur un build de production (Chromium)                             |
| `pnpm verify`             | lint → format:check → typecheck → test → build                                     |
| `pnpm db:migrations:list` | migrations du dépôt avec leur empreinte, à comparer avec `supabase migration list` |

## Arborescence

```
.github/workflows/ci.yml   CI : verify puis test:e2e
docs/decisions.md          journal des décisions d'architecture
docs/deploy.md             environnements (local, preview, production), migrations distantes appliquées par Léandre
docs/design-system.md      règles de la direction artistique
e2e/                       tests Playwright
src/app/                   App Router (layout, globals.css, icon.svg, (app)/, design/, not-found)
src/components/brand/      Galet, Logo, Trail
src/components/layout/     AppShell, SideNav, BottomNav, TopBar, PageHeader, NavLink
src/components/ui/         primitives façon shadcn, écrites à la main
src/lib/                   cn, env (zod), format (dates fr-FR), constants
src/server/                db/ (pool, Kysely, withUser/withSystem), auth/ (AuthService local et supabase, session), services/, actions/, sites/import/ (moteur d'import VIGIE), supabase/ (clients auth), domain/, repositories/ (interfaces, SiteRepository implémenté)
src/components/sites/      SiteCard, SiteSearchForm, SitePicker (combobox réutilisable)
src/components/visits/     liste, création, fiche (en-tête, actions, bandeau, onglets, informations, participants), notes/ (onglet Notes), photos/ (onglet Photos, visionneuse, file d'envoi)
src/lib/notes/             mise en forme des notes (puces), moteur d'enregistrement automatique
src/lib/photos/            traitement des images dans le navigateur (octets magiques, EXIF, 1600/400 px), file d'envoi
src/server/storage/        StorageService (supabase, local), signature HMAC, route locale
src/server/photos/         dépôt, service et schémas des photos (lignes pending, URL signées, confirmation, purge)
src/server/plans/          dépôts plans et repères, service (import pending, pages, confirmation, purge, numérotation stable)
src/lib/plans/             import des plans dans le navigateur (pdf.js, 3 500 px, PNG/JPEG), géométrie de la visionneuse
src/lib/upload/            PUT signé avec progression, partagé par photos et plans
src/components/plans/      dialog d'import, visionneuse zoomable (Pointer Events), repères, feuille de repère
src/server/reserves/       dépôt (vue reserves_with_state, version, plan, historique), service (miniatures signées, conflit)
src/lib/reserves/          schéma zod partagé client/serveur, échéances, tri / filtres / URL, liens
src/components/reserves/   onglet Réserves, carte, feuille (react-hook-form), détail avec historique, section du site
src/lib/report/            rapport PDF : DTO, modèle pur, options, géométrie, thème (tokens), document react-pdf, worker, génération
src/server/reports/        dépôt (réservation pending, lecture figée, confirmation, historique), service (URL signées, stat)
src/components/report/     onglet Rapport (options, progression, historique)
public/fonts/report/       polices TTF du rapport (OFL)
scripts/fixtures/          génération des images de test synthétiques (jamais de vraie photo)
docs/samples/              échantillons fictifs (export VIGIE)
src/middleware.ts          protection des routes et rafraîchissement de session (aucune lecture en base)
supabase/migrations/       migrations SQL horodatées (jamais modifiées après commit)
supabase/seed.sql          données fictives pour la base locale / de test uniquement
supabase/tests/            bootstrap.sql (émulation Supabase pour ronde_test) et tests de la base
scripts/db/                reset.mjs, gen-types.mjs
tests/                     tests Vitest (miroir de src/)
```

## Règles permanentes

1. **Pas de couleur en dur** : uniquement les tokens de `globals.css` (`bg-brand`, `text-ink-2`,
   `var(--color-…)`). La palette Tailwind par défaut est désactivée.
2. **Un statut est toujours accompagné de son libellé** ; les couleurs de statut ne servent
   qu'aux statuts ; la couleur de marque n'indique jamais un statut.
3. **Zones tactiles de 44 px minimum** (48 px pour les actions principales), pas d'interaction
   réservée au survol, focus clavier visible.
4. **Textes affichés en français, code en anglais** (identifiants, noms de fichiers, commits).
   Dates en `fr-FR`, fuseau `Europe/Paris`, via `src/lib/format.ts`.
5. **Pas d'accès direct à Supabase hors de `src/server/`** : composants, pages et actions passent
   par les repositories, `StorageService` et `AuthService`.
6. **Aucune donnée réelle dans le dépôt** : données fictives uniquement (sites, personnes,
   réserves), et jamais de secret (`.env.local` est ignoré, `.env.example` documente).
7. **Commit et push après chaque point de spécification**, en Conventional Commits
   (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `ci:`), petits et cohérents. **Jamais de commit
   quand `pnpm verify` ou `pnpm test:db` échoue** sur ce qui a été modifié : lancer les deux et lire
   leur code de sortie avant `git commit`. Les tests d'intégration ne dépendent ni du nombre de
   lignes en base ni de l'ordre d'exécution : `audit_log` et les données en ajout seul
   s'accumulent dans `ronde_test`, toute assertion de comptage se limite aux lignes créées par le
   test.
8. **Ne jamais modifier une migration existante** : toute correction est une nouvelle migration
   horodatée dans `supabase/migrations/` (voir la migration 8, corrective, comme exemple).
9. **`pnpm verify` et `pnpm test:e2e` doivent passer** avant de terminer une étape, en local et
   dans la CI.
10. Confirmations par `Dialog`, jamais `window.confirm`. Thème clair uniquement en V1.
11. JSDoc sur chaque composant et fonction exportés.
12. Polices locales par `next/font/local` (`public/fonts/web/`) : aucun appel à Google ni à un
    CDN, ni au build ni à l’exécution.
13. **Base de données** : ne jamais réinitialiser autre chose que `ronde_test` sur localhost ;
    `seed.sql` et `supabase/tests/bootstrap.sql` ne s'exécutent jamais sur un vrai projet
    Supabase ; aucune clé ni URL réelle dans le dépôt.
14. **Interdiction d'importer `@supabase/*` hors de `src/server/`** (règle ESLint
    `no-restricted-imports`). Les écrans passent par les repositories, `StorageService` et
    `AuthService`.
15. Les règles d'accès vivent dans la base (RLS, triggers, RPC) ; l'application ne les duplique
    que pour l'ergonomie. Après toute migration : `pnpm db:reset && pnpm test:db`, puis
    `pnpm db:types`.
16. **Jamais de `select *`** : les requêtes listent leurs colonnes (privilèges de colonnes sur
    `profiles`).
17. **Toute page et toute action serveur appellent `requireUser()` ou `requireRole()`**
    (`requireRoleForAction` dans une action). Le middleware ne suffit jamais seul.
18. **Données uniquement via `withUser`** (RLS) ou `withSystem(reason)` justifié et réservé aux
    services serveur. Requêtes Kysely paramétrées, jamais de SQL concaténé.
19. **Jamais `getSession()` pour décider d'un droit** : identité vérifiée (`getUser()` ou
    signature) puis profil relu en base à chaque requête.
20. **Jamais de mot de passe ni d'email en clair dans les logs** ni dans `audit_log` (hash).
    Le mot de passe provisoire est affiché une seule fois et jamais stocké en clair.
21. `AUTH_PROVIDER=local` est réservé aux tests et au développement (localhost, jamais Vercel).
22. **Un compte ne se supprime jamais** : il se désactive (trigger `profiles_never_deleted`,
    clés `restrict`). Anonymisation RGPD prévue à l'étape 11.
23. **Sites** : jamais modifiés à la main ni supprimés ; le référentiel ne change que par import
    CSV (simulation puis application, `withSystem('site_import…')`). Les alias de colonnes sont
    dans `src/server/sites/import/format.ts`.
24. **Aucun fichier de plus de 4 Mo ne transite par une action serveur ou une route** (limite
    Vercel de 4,5 Mo par requête) ; photos, plans et rapports PDF sont envoyés directement au
    stockage par URL signée (étape 7).
25. **Visites** : toute mise à jour envoie la `version` connue (concurrence optimiste) ; les
    changements de statut et la suppression passent par les RPC ; le site est immuable ; la
    règle type/motif est vérifiée côté serveur (`visitInputSchema`, `visitUpdateSchema`).
26. `audit_log` et `reserve_events` sont en ajout seul : jamais de `update`, `delete` ni
    `truncate`, même en test (seule la réinitialisation complète de `ronde_test` les vide).
27. **Notes** : le contenu d'une zone envoie la `version` de la note, la structure des zones
    (ajout, retrait, libellé, ordre) envoie la `version` de la visite ; les clés de zone sont
    stables (les libellés se renomment) ; une zone ne se retire que vide et sans photo liée ; le
    texte est du texte brut mis en forme par `parseNoteContent` (jamais de HTML).
28. **Aucune URL signée sans vérification de droit via `withUser`** : une URL d'envoi n'est
    délivrée qu'après l'insertion d'une ligne `photos` en `pending` sous RLS, une URL de lecture
    qu'après la lecture de la ligne sous RLS. `STORAGE_PROVIDER=local` est réservé aux tests et au
    développement (mêmes garde-fous que `AUTH_PROVIDER=local`) ; les images sont compressées
    dans le navigateur (JPEG 1600 px + miniature 400 px, EXIF supprimé) et l'original n'est
    jamais envoyé ; 500 photos par visite au plus.
29. **Plans** : rattachés au site, jamais supprimés (archivés) ; pages converties en images dans
    le navigateur (`pdfjs-dist`, worker servi localement, 3 500 px, PNG ≤ 8 Mo sinon JPEG 0,9),
    original conservé ; repères en coordonnées relatives à 5 décimales, numéros attribués par le
    compteur `plan_marker_counters` (trigger, migration 17), jamais réattribués, même après la
    suppression du dernier ; un toucher seul place un repère, jamais un pincement.
30. **Réserves** : toute mise à jour envoie la `version` connue (conflit = réserve actuelle
    renvoyée, saisie conservée) ; modifiables seulement pendant la visite (`can_edit_visit`) ;
    suppression par `soft_delete_reserve` (le repère part avec) ; numéros par site jamais
    réattribués ; un repère au plus par réserve ; photos du défaut de la même visite, `proof`
    refusé jusqu'à l'étape 13 ; l'e-mail d'un responsable externe n'apparaît que dans le
    détail (jamais dans une liste, une URL ni un journal) ; formulaire `react-hook-form` +
    `reserveFormSchema` (`src/lib/reserves/schema.ts`), revalidé côté serveur.
31. **Rapport PDF** : généré dans le navigateur (`@react-pdf/renderer`, mise en page dans un Web
    Worker), jamais sur le serveur ; une seule lecture serveur (`getReportData` /
    `startReport`) puis `buildReportModel` pur, les composants PDF n'affichent que le modèle ;
    polices locales (`public/fonts/report/`), jamais de CDN ; **aucun e-mail dans le rapport** ;
    un rapport n'est jamais modifié ni supprimé (`pending` → `ready` par son auteur, puis figé) ;
    au-delà de 50 Mo, téléchargé mais pas conservé.
