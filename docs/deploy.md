# Déploiement et environnements

Ce document est écrit pour Léandre. Il décrit les trois environnements de RONDE, les variables
de chaque environnement Vercel, l'ordre de mise en production et les vérifications associées.

> **Règle permanente** : Claude Code ne modifie jamais un environnement distant (ni migration,
> ni écriture, ni `db push`) : seule la base locale `ronde_test` est à sa portée. Les migrations
> distantes sont appliquées par Léandre, depuis son PC, selon ce document.

## 1. Environnements

| Environnement  | Code                                    | Base et stockage                                                                          | Qui déploie                                         |
| -------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **local**      | copie de travail                        | PostgreSQL local `ronde_test` (`pnpm db:reset`), stockage `local` (`.storage/`)           | tout le monde, à volonté                            |
| **preview**    | toute branche poussée (dont `claude/*`) | **projet Supabase de test** (distinct de la production), stockage `supabase` de ce projet | Vercel, automatiquement à chaque push               |
| **production** | branche `main` uniquement               | projet Supabase de production, stockage `supabase` de ce projet                           | Vercel, automatiquement à chaque fusion dans `main` |

Dans Vercel → **Settings → Git**, la _Production Branch_ doit être `main`. Toute autre
branche produit un déploiement de prévisualisation, qui lit les variables de l'environnement
**Preview** : il ne touche donc jamais la base de production, même quand le code contient une
migration pas encore appliquée.

## 2. Variables par environnement dans Vercel

| Variable                        | Production                              | Preview                                  | Exposée au navigateur ? |
| ------------------------------- | --------------------------------------- | ---------------------------------------- | ----------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL du projet de production             | URL du projet de **test**                | oui                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon / publishable de production    | clé anon / publishable du projet de test | oui                     |
| `SUPABASE_SERVICE_ROLE_KEY`     | clé service_role de production          | clé service_role du projet de test       | **non**                 |
| `DATABASE_URL`                  | pooler transaction (6543) du rôle dédié | pooler transaction du projet de test     | **non**                 |
| `DATABASE_POOL_MAX`             | `5`                                     | `5`                                      | non                     |
| `AUTH_PROVIDER`                 | `supabase` (ou absente)                 | `supabase` (ou absente)                  | non                     |
| `STORAGE_PROVIDER`              | `supabase` (ou absente)                 | `supabase` (ou absente)                  | non                     |

À ne **jamais** définir dans Vercel, quel que soit l'environnement : `ALLOW_LOCAL_AUTH`,
`LOCAL_AUTH_SECRET`, `ALLOW_LOCAL_STORAGE`, `LOCAL_STORAGE_SECRET`, `LOCAL_STORAGE_DIR`. Les
fournisseurs `local` sont refusés au démarrage dès que `VERCEL` est défini.

Chaque projet Supabase a son rôle de connexion dédié (`ronde_app`, voir
`docs/supabase-setup.md`) et son bucket `visit-photos` / `site-plans` / `reports` créés par la
migration 7.

## 3. Ordre de mise en production

Depuis le PC Windows, avec la CLI Supabase (`pnpm exec supabase --version`) :

1. **Projet de test d'abord.**

   ```bash
   pnpm db:migrations:list
   pnpm exec supabase link --project-ref <ref-du-projet-de-test>
   pnpm exec supabase migration list
   pnpm exec supabase db push
   pnpm exec supabase migration list
   ```

   Puis ouvrez le déploiement de prévisualisation de la branche dans Vercel et déroulez le
   scénario de la fonctionnalité (connexion, visite, photos, plans…).

2. **Production.**

   ```bash
   pnpm exec supabase link --project-ref <ref-du-projet-de-production>
   pnpm exec supabase migration list
   pnpm exec supabase db push
   pnpm exec supabase migration list
   ```

   `db push` n'applique que les versions absentes côté _Remote_ ; il ne modifie jamais une
   migration déjà appliquée. Les migrations de RONDE sont écrites pour être appliquées **avant**
   le code qui les utilise (colonnes ajoutées avec une valeur par défaut, vues recréées).

3. **Fusion dans `main`** (pull request ou fusion locale puis `git push origin main`). Vercel
   déploie la production.

4. **Vérification** : page de connexion, une visite existante, l'onglet Photos (envoi d'une
   photo de test puis suppression), le journal d'audit en tant qu'admin. En cas de problème,
   **Vercel → Deployments → Promote** sur le déploiement précédent remet le code d'avant ; les
   migrations, elles, ne se retirent pas : écrivez-en une nouvelle (règle 8 de `CLAUDE.md`).

## 4. Liste de contrôle avant une mise en production

- [ ] CI verte sur la branche (trois jobs).
- [ ] `pnpm db:migrations:list` : la liste locale est celle attendue, et chaque version
      apparaît dans `supabase migration list` du projet de **test** côté _Remote_.
- [ ] Déploiement de prévisualisation vérifié à la main sur la fonctionnalité livrée.
- [ ] `supabase migration list` sur la **production** : seules les nouvelles versions manquent.
- [ ] `supabase db push` sur la production, puis `migration list` à nouveau : plus aucune
      version manquante.
- [ ] Variables Vercel de production complètes (tableau ci-dessus), aucune variable `LOCAL_*`.
- [ ] Fusion dans `main`, déploiement « Ready », vérification manuelle.
- [ ] Aucune donnée fictive importée en production (sites de test, comptes `example.test`).

## 5. Suite de contrat `supabase` (authentification et stockage)

Les suites de contrat tournent en permanence sur les fournisseurs `local` et, **uniquement
contre le projet de test**, sur les fournisseurs `supabase`. Jamais contre la production.

```bash
SUPABASE_TEST_URL=https://<ref-test>.supabase.co \
SUPABASE_TEST_ANON_KEY=<anon-du-projet-de-test> \
SUPABASE_TEST_SERVICE_ROLE_KEY=<service-role-du-projet-de-test> \
pnpm vitest run --config vitest.db.config.mts tests/integration/auth-contract.test.ts

SUPABASE_TEST_URL=https://<ref-test>.supabase.co \
SUPABASE_TEST_SERVICE_ROLE_KEY=<service-role-du-projet-de-test> \
pnpm test tests/server/storage/contract.test.ts
```

Sous PowerShell, définissez les variables avec `$env:SUPABASE_TEST_URL = "…"` avant la
commande. La suite de stockage écrit puis efface un objet `contract-…/photo.jpg` dans le bucket
`visit-photos` du projet de test ; la suite d'authentification crée des comptes fictifs et les
désactive.

## 6. Accès de Claude Code

L'environnement Claude Code ne doit contenir **aucune clé de production** : seulement la base
locale (`DATABASE_URL` sur `127.0.0.1`) et, au besoin, les clés du projet de **test** pour les
suites de contrat. Les connecteurs (MCP Supabase, MCP Vercel) ne servent qu'en lecture ; toute
écriture distante est interdite par `CLAUDE.md`, et Claude Code doit s'arrêter et le signaler
si une tâche semble l'exiger.
