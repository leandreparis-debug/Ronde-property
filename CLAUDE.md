# RONDE — consignes pour les sessions de développement

## Projet

RONDE est l'application des visites de site des Responsables Techniques (RT) de Carrefour
Property : préparer, mener et suivre chaque visite d'entrepôt, jusqu'à la levée des réserves.
Elle remplace l'outil interne « CR Visites » (aucun code repris).

Utilisateurs : **RT** (saisie sur tablette au doigt et sur PC), **Direction** (lecture seule),
**Admin** (gestion des comptes).

Étapes : 1 fondations et design system (faite) · 2 modèle de données Supabase et RLS (faite) ·
3 authentification, rôles, audit (faite) · 4 référentiel des sites (CSV VIGIE, faite) · 5 visites · 6 notes
par zone · 7 photos · 8 plans AutoCAD et repères · 9 réserves · 10 rapport PDF · 11 recette et
déploiement.

## Stack et versions (exactes, pas de `^`)

- Next.js 15.5.28, App Router, dossier `src/` · React 19.3.1 · TypeScript 5.9.3 strict avec
  `noUncheckedIndexedAccess`.
- Tailwind CSS 4.3.3 en configuration CSS-first (`@theme` dans `src/app/globals.css`, pas de
  `tailwind.config.js`).
- Node 22, pnpm 10 (`packageManager` dans `package.json`).
- lucide-react, clsx + tailwind-merge (`cn`), class-variance-authority, Radix (dialog, tabs,
  slot, toast), zod.
- Qualité : ESLint 9 (config Next + TypeScript), Prettier 3, Vitest 4 + Testing Library + jsdom,
  Playwright 1.63 + @axe-core/playwright.
- V1 hébergée sur Vercel + Supabase ; V2 sur serveur interne.

## Commandes

| Commande            | Rôle                                                   |
| ------------------- | ------------------------------------------------------ |
| `pnpm dev`          | serveur de développement                               |
| `pnpm build`        | build de production                                    |
| `pnpm start`        | serveur de production                                  |
| `pnpm lint`         | ESLint, zéro avertissement toléré                      |
| `pnpm format`       | Prettier (écriture)                                    |
| `pnpm format:check` | Prettier (vérification)                                |
| `pnpm typecheck`    | `tsc --noEmit`                                         |
| `pnpm test`         | tests unitaires Vitest                                 |
| `pnpm test:e2e`     | tests Playwright sur un build de production (Chromium) |
| `pnpm verify`       | lint → format:check → typecheck → test → build         |

## Arborescence

```
.github/workflows/ci.yml   CI : verify puis test:e2e
docs/decisions.md          journal des décisions d'architecture
docs/design-system.md      règles de la direction artistique
e2e/                       tests Playwright
src/app/                   App Router (layout, globals.css, icon.svg, (app)/, design/, not-found)
src/components/brand/      Galet, Logo, Trail
src/components/layout/     AppShell, SideNav, BottomNav, TopBar, PageHeader, NavLink
src/components/ui/         primitives façon shadcn, écrites à la main
src/lib/                   cn, env (zod), format (dates fr-FR), constants
src/server/                db/ (pool, Kysely, withUser/withSystem), auth/ (AuthService local et supabase, session), services/, actions/, sites/import/ (moteur d'import VIGIE), supabase/ (clients auth), domain/, repositories/ (interfaces, SiteRepository implémenté)
src/components/sites/      SiteCard, SiteSearchForm, SitePicker (combobox réutilisable)
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
   (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `ci:`), petits et cohérents.
8. **Ne jamais modifier une migration existante** : toute correction est une nouvelle migration
   horodatée dans `supabase/migrations/` (voir la migration 8, corrective, comme exemple).
9. **`pnpm verify` et `pnpm test:e2e` doivent passer** avant de terminer une étape, en local et
   dans la CI.
10. Confirmations par `Dialog`, jamais `window.confirm`. Thème clair uniquement en V1.
11. JSDoc sur chaque composant et fonction exportés.
12. Polices auto-hébergées par `next/font` : aucun CDN de polices à l'exécution.
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
25. `audit_log` et `reserve_events` sont en ajout seul : jamais de `update`, `delete` ni
    `truncate`, même en test (seule la réinitialisation complète de `ronde_test` les vide).
