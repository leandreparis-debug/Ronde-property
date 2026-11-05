# RONDE

Application des visites de site des Responsables Techniques (RT) de Carrefour Property :
préparer, mener et suivre chaque visite d'entrepôt, jusqu'à la levée des réserves. Elle
remplace l'outil interne « CR Visites ».

**Version 1.0.0** : phase 1 complète (étapes 1 à 11), prête pour le pilote. Historique dans
[`CHANGELOG.md`](CHANGELOG.md).

- **RT** : saisie sur tablette (au doigt, sur site, application installable) et sur PC
  (préparation, rapport) ; notes par zone, photos, plans et repères, réserves, rapport PDF.
- **Direction** : consultation en lecture seule, téléchargement des rapports.
- **Admin** : comptes, import du référentiel VIGIE, avis du pilote, journal d'audit, RGPD.

## Prérequis

- Node 22, pnpm 10 (`corepack enable`)
- PostgreSQL 16 local pour les tests (base `ronde_test`)

## Installation

```bash
pnpm install
pnpm db:reset
cp .env.example .env.local
pnpm dev
```

L'application est servie sur <http://localhost:3000>. Avec les fournisseurs `local` (voir
`.env.example`), les comptes fictifs se connectent avec le mot de passe `Ronde-test-2026` :
`rt.alice@example.test` (RT), `direction.claire@example.test` (direction),
`admin.david@example.test` (admin). Le design system est sur `/design`, les guides sur `/aide`.

## Commandes

| Commande                           | Rôle                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                         | serveur de développement                                               |
| `pnpm build`, `pnpm start`         | build et serveur de production                                         |
| `pnpm verify`                      | lint, format, types, tests unitaires, build                            |
| `pnpm test`                        | tests unitaires (Vitest, Testing Library)                              |
| `pnpm db:reset`                    | réinitialise la base locale `ronde_test` (émulation Supabase + seed)   |
| `pnpm test:db`                     | tests de la base et d'intégration (RLS, triggers, audit RLS, services) |
| `pnpm test:e2e`                    | parcours Playwright sur un build de production (axe, CSP surveillée)   |
| `pnpm test:acceptance`             | recette des 6 critères du cahier des charges, rapport HTML             |
| `pnpm test:contract`               | contrats `supabase` contre le projet de **test** (Léandre)             |
| `pnpm db:types`, `pnpm db:codegen` | régénèrent les types du schéma                                         |
| `pnpm db:migrations:list`          | migrations du dépôt avec leur empreinte                                |

La CI (`.github/workflows/ci.yml`) exécute à chaque push : `pnpm verify` et `pnpm audit
--prod`, la recherche de secrets (gitleaks), la base (`pnpm test:db`), puis `pnpm test:e2e` et
`pnpm test:acceptance` (rapport en artefact).

## Documentation

**Mise en production et exploitation**

- [Mise en production](docs/go-live.md) : la liste de contrôle, dans l'ordre.
- [Déploiement](docs/deploy.md) : environnements, variables, migrations distantes.
- [Mise en place de Supabase](docs/supabase-setup.md), [tâches planifiées](docs/cron.md).
- [Sécurité](docs/security.md), [RGPD](docs/rgpd.md).
- [Reprise du projet](docs/reprise.md), [migration vers le serveur interne](docs/migration-serveur-interne.md).

**Utilisateurs**

- [Guide des RT](docs/guide-rt.md), [guide de l'administrateur](docs/guide-admin.md) (aussi
  sur `/aide` dans l'application).

**Conception**

- [Décisions d'architecture](docs/decisions.md), [modèle de données](docs/data-model.md),
  [design system](docs/design-system.md), [couche serveur](src/server/README.md).
- Par fonctionnalité : [authentification](docs/auth.md), [import VIGIE](docs/sites-import.md),
  [visites](docs/visits.md), [notes](docs/notes.md), [photos](docs/photos.md),
  [plans](docs/plans.md), [réserves](docs/reserves.md), [rapport PDF](docs/report.md),
  [stockage](docs/storage.md), [application installable](docs/pwa.md).
- [Consignes de développement](CLAUDE.md).

## Pages

| Page                                              | Qui    | Rôle                                                                                 |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `/`, `/visites/nouvelle`, `/visites/[id]`         | tous   | mes visites, création, fiche (informations, notes, réserves, photos, plans, rapport) |
| `/reserves`                                       | tous   | mes réserves, filtres                                                                |
| `/sites`, `/sites/[code]`                         | tous   | référentiel VIGIE, fiche du site, plans, réserves du site                            |
| `/compte`, `/aide`, `/aide/[guide]`               | tous   | compte, guides                                                                       |
| `/admin/comptes`, `/admin/avis`, `/admin/journal` | admin  | comptes (sessions, RGPD), avis du pilote, journal d'audit                            |
| `/admin/sites/import`, `/admin/sites/imports`     | admin  | import CSV VIGIE, historique                                                         |
| `/connexion`, `/hors-ligne`, `/design`            | public | connexion, aide hors connexion, design system (données fictives)                     |

## Base de données

Le schéma est livré en migrations Supabase (`supabase/migrations/`, 20 migrations). En local, il
tourne sur un PostgreSQL 16 nu grâce à `supabase/tests/bootstrap.sql`, qui émule les rôles et
les schémas `auth` et `storage` de Supabase. `seed.sql` (données fictives) refuse de s'exécuter
ailleurs que dans `ronde_test` ; ni la seed ni `bootstrap.sql` ne s'appliquent à un vrai projet.

## Variables d'environnement

Copier `.env.example` en `.env.local` (ignoré par git, comme tout `.env*`). Les variables sont
validées au démarrage par `src/lib/env.ts` ; les fournisseurs `local` sont refusés sur Vercel et
contre une base distante.
