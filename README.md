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

La CI GitHub Actions (`.github/workflows/ci.yml`) exécute `pnpm verify` puis `pnpm test:e2e`
sur Chromium à chaque push et pull request.

## Structure

```
.github/workflows/   CI
docs/                décisions d'architecture, règles du design system
e2e/                 tests Playwright
public/              fichiers statiques
src/app/             routes (App Router), styles globaux et tokens, favicon
src/components/      brand/ (Galet, Logo, Trail), layout/ (coquille), ui/ (primitives)
src/lib/             utilitaires : cn, env, format, constants
src/server/          future couche repositories et services (voir src/server/README.md)
tests/               tests Vitest
```

## Documentation

- [Design system](docs/design-system.md) : tokens, typographie, mascotte, composants.
- [Décisions d'architecture](docs/decisions.md).
- [Couche serveur](src/server/README.md).
- [Consignes de développement](CLAUDE.md).

## Variables d'environnement

Copier `.env.example` en `.env.local` (ignoré par git). Les variables sont validées au
démarrage par `src/lib/env.ts` : une variable absente est tolérée à l'étape 1, une variable
présente mais mal formée arrête le démarrage avec un message explicite.
