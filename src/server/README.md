# `src/server/` — couche d'accès aux données

**Seul** endroit du dépôt autorisé à importer `@supabase/*` (règle ESLint
`no-restricted-imports`). Les composants, pages et actions serveur passent par les interfaces
de ce dossier, pour que la migration V2 (serveur interne) ne touche pas les écrans.

| Dossier         | Contenu                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db/`           | `database.types.ts`, généré par `pnpm db:types` depuis la base de test ; helpers `Tables<>`, `Enums<>`.                                                                                                                                           |
| `supabase/`     | `server.ts` (client serveur avec cookies, `@supabase/ssr`), `browser.ts` (client navigateur, upload direct à l'étape 7), `admin.ts` (`service_role`, `server-only`). Les variables sont vérifiées à l'appel, pas à l'import.                      |
| `domain/`       | Types métier et schémas zod (`Visit`, `Reserve`, …), libellés français des énumérations, trame `templates.ts`.                                                                                                                                    |
| `repositories/` | **Interfaces uniquement** à l'étape 2 : `SiteRepository`, `VisitRepository`, `ReserveRepository`, `PhotoRepository`, `PlanRepository`, `ReportRepository`, `ProfileRepository`, `StorageService`. Implémentations Supabase à partir de l'étape 4. |

## Règles

- Les règles d'accès sont dans la base (RLS, triggers, RPC). Les repositories ne les
  contournent jamais : ils utilisent le client de l'utilisateur, sauf pour les opérations
  d'administration explicitement réservées au service (`admin.ts`).
- Les implémentations seront injectées depuis un point unique (`src/server/index.ts`, étape 4).
- Aucune donnée réelle dans les fixtures de test : uniquement des données fictives.
