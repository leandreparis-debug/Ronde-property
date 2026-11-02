# RONDE

Application des visites de site des Responsables Techniques (RT) de Carrefour Property :
préparer, mener et suivre chaque visite d'entrepôt, jusqu'à la levée des réserves.

- **RT** : saisie sur tablette (au doigt, sur site) et sur PC (préparation, rapport).
- **Direction** : consultation en lecture seule.
- **Admin** : gestion des comptes.

L'étape 1 pose les fondations : projet Next.js, outillage qualité, CI, design system (tokens,
polices, mascotte « Galet », composants de base), coquille de l'application et page `/design`.

## Prérequis

- Node 22
- pnpm 10 (activable avec `corepack enable`)

## Installation

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

L'application est servie sur <http://localhost:3000>. La page de référence du design system
est sur <http://localhost:3000/design>.

## Scripts

| Script              | Rôle                                                    |
| ------------------- | ------------------------------------------------------- |
| `pnpm dev`          | serveur de développement                                |
| `pnpm build`        | build de production                                     |
| `pnpm start`        | serveur de production                                   |
| `pnpm lint`         | ESLint (aucun avertissement toléré)                     |
| `pnpm format`       | Prettier, écriture                                      |
| `pnpm format:check` | Prettier, vérification                                  |
| `pnpm typecheck`    | vérification TypeScript                                 |
| `pnpm test`         | tests unitaires (Vitest, Testing Library, jsdom)        |
| `pnpm test:e2e`     | tests de bout en bout (Playwright + axe, build de prod) |
| `pnpm verify`       | lint, format:check, typecheck, test, build              |
| `pnpm db:reset`     | réinitialise la base de test locale `ronde_test`        |
| `pnpm test:db`      | tests de la base (RLS, triggers, stockage)              |
| `pnpm db:types`     | régénère les types TypeScript du schéma                 |

La CI GitHub Actions (`.github/workflows/ci.yml`) exécute trois jobs à chaque push et pull
request : `pnpm verify`, `pnpm test:e2e` sur Chromium, et `pnpm db:reset && pnpm test:db` sur
un service PostgreSQL 16.

## Structure

```
.github/workflows/   CI
docs/                décisions d'architecture, règles du design system
e2e/                 tests Playwright
public/              fichiers statiques
src/app/             routes (App Router), styles globaux et tokens, favicon
src/components/      brand/ (Galet, Logo, Trail), layout/ (coquille), ui/ (primitives)
src/lib/             utilitaires : cn, env, format, constants
src/server/          clients Supabase, types générés, domaine (zod), interfaces de repositories
supabase/            migrations SQL, seed fictive, config CLI, bootstrap et tests de la base
scripts/db/          réinitialisation de la base de test, génération des types
tests/               tests Vitest
```

## Documentation

- [Design system](docs/design-system.md) : tokens, typographie, mascotte, composants.
- [Modèle de données](docs/data-model.md) : schéma, matrice RLS, buckets.
- [Mise en place de Supabase](docs/supabase-setup.md) : créer le projet, appliquer les migrations.
- [Décisions d'architecture](docs/decisions.md).
- [Couche serveur](src/server/README.md).
- [Consignes de développement](CLAUDE.md).

## Base de données

Le schéma est livré sous forme de migrations Supabase (`supabase/migrations/`). En local, les
tests de la base tournent sur un PostgreSQL 16 nu grâce à `supabase/tests/bootstrap.sql`, qui
émule les rôles et les schémas `auth` et `storage` de Supabase :

```bash
pnpm db:reset
```

```bash
pnpm test:db
```

`seed.sql` et `bootstrap.sql` ne doivent jamais être exécutés sur un vrai projet Supabase.

## Variables d'environnement

Copier `.env.example` en `.env.local` (ignoré par git). Les variables sont validées au
démarrage par `src/lib/env.ts` : une variable absente est tolérée à l'étape 1, une variable
présente mais mal formée arrête le démarrage avec un message explicite.
