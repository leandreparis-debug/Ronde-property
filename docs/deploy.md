# Déploiement et environnements

Ce document est écrit pour Léandre. Il décrit les trois environnements de RONDE, les variables
de chaque environnement Vercel, l'ordre de mise en production et les vérifications associées.

> **Règle permanente** : Claude Code ne modifie jamais un environnement distant (ni migration,
> ni écriture, ni `db push`) : seule la base locale `ronde_test` est à sa portée. Les migrations
> distantes sont appliquées par Léandre, depuis son PC, selon ce document.

## 0. Mise en place initiale (à faire une fois, par Léandre)

> **Tant que la branche `main` n'existe pas, chaque push sur la branche de travail
> (`claude/blissful-wright-hqbfq7`) est déployé en production** : Vercel prend la branche par
> défaut du dépôt comme branche de production.

1. **Couper l'accès de Claude Code à la production.** Sur claude.ai → **Settings →
   Connectors**, déconnecter le connecteur **Supabase** (ou le désactiver pour les sessions
   Claude Code). La règle écrite de `CLAUDE.md` interdit son usage en écriture, mais seule la
   déconnexion supprime réellement l'accès. Faire de même pour le connecteur Vercel si l'on ne
   veut garder aucun accès en écriture.
2. **Créer la branche `main`** sur GitHub à partir de `claude/blissful-wright-hqbfq7` : page du
   dépôt → menu des branches → saisir `main` → « Create branch main from
   claude/blissful-wright-hqbfq7 ». Puis **Settings → General → Default branch** : choisir `main`.
3. **Production depuis `main`** : Vercel → projet `ronde` → **Settings → Git → Production
   Branch** = `main`. Dès lors, toute autre branche produit un déploiement de prévisualisation.
4. **Projet Supabase de test** : créer un second projet (même région), y appliquer toutes les
   migrations (`supabase link --project-ref <ref-test>` puis `supabase db push`), créer son rôle
   `ronde_app` (voir `docs/supabase-setup.md`), puis dans Vercel → **Settings → Environment
   Variables**, renseigner pour l'environnement **Preview** uniquement les variables du tableau
   ci-dessous avec les valeurs du projet de test.
5. Vérifier : un push sur la branche de travail crée un déploiement « Preview » (et non
   « Production ») qui se connecte au projet de test.

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

| Variable                        | Production                                | Preview                                                      | Exposée au navigateur ? |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------------------ | ----------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL du projet de production               | URL du projet de **test**                                    | oui                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon / publishable de production      | clé anon / publishable du projet de test                     | oui                     |
| `SUPABASE_SERVICE_ROLE_KEY`     | clé service_role de production            | clé service_role du projet de test                           | **non**                 |
| `DATABASE_URL`                  | pooler transaction (6543) du rôle dédié   | pooler transaction du projet de test                         | **non**                 |
| `DATABASE_POOL_MAX`             | `5`                                       | `5`                                                          | non                     |
| `AUTH_PROVIDER`                 | `supabase` (ou absente)                   | `supabase` (ou absente)                                      | non                     |
| `STORAGE_PROVIDER`              | `supabase` (ou absente)                   | `supabase` (ou absente)                                      | non                     |
| `CRON_SECRET`                   | 48 caractères aléatoires (`docs/cron.md`) | inutile (les tâches planifiées ne tournent qu'en production) | **non**                 |

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

### Migrations à appliquer par Léandre (état au 05/11/2026)

| Version          | Fichier                                                     | Contenu                                                                                                                                    | Test    | Production |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ---------- |
| `20261104090000` | `20261104090000_site_plan_pages_and_marker_checks.sql`      | migration 15 : pages de plans, statut d'envoi, contrôles des repères, purge                                                                | à faire | à faire    |
| `20261105090000` | `20261105090000_marker_counters_and_report_uploads.sql`     | migration 17 : compteur des repères, rapports `pending` → `ready` (numéro, nom, brouillon, pages), purge, `visit_summaries.last_report_id` | à faire | à faire    |
| `20261104120000` | `20261104120000_reserves_version_markers_and_state.sql`     | migration 16 : version des réserves, responsable facultatif, repère de réserve, contrôle des photos, vue enrichie, index                   | à faire | à faire    |
| `20261105150000` | `20261105150000_profile_sessions_revoked_at.sql`            | migration 18 : `profiles.sessions_revoked_at` (déconnexion de toutes les sessions, désactivation), vues en lecture seule, rien pour `anon` | à faire | à faire    |
| `20261105160000` | `20261105160000_rgpd_anonymization_and_external_emails.sql` | migration 19 : e-mail externe jamais dans l'historique, `anonymize_profile`, `clear_external_responsible_emails`                           | à faire | à faire    |
| `20261105170000` | `20261105170000_feedback.sql`                               | migration 20 : table `feedback` (« Donner mon avis »), RLS insertion par l'auteur actif, lecture admin                                     | à faire | à faire    |

Vérifiez les versions exactes avec `pnpm db:migrations:list` avant `db push`. La migration 16
recrée la vue `reserves_with_state` (mêmes colonnes qu'avant plus les nouvelles) et ajoute
`reserves.version` avec la valeur 1 par défaut : elle s'applique **avant** le déploiement du
code de l'étape 9, sans interruption pour le code de l'étape 8. Scénario de vérification sur la
prévisualisation : créer une réserve avec une photo, la placer sur un plan, la lever, la
rouvrir, la supprimer (le repère disparaît), puis consulter la page du site.

La migration 17 initialise le compteur des repères à partir des numéros existants et passe les
rapports existants en `ready` (numérotés par date) : elle s'applique avant le code de
l'étape 10. Scénario de vérification sur la prévisualisation : onglet Rapport d'une visite en
cours, « Générer le rapport » (progression, téléchargement, ligne « Brouillon » dans
l'historique), « Télécharger » depuis l'historique, terminer la visite puis régénérer (plus de
badge), génération par un compte direction ; supprimer le dernier repère d'un plan puis en
placer un nouveau : le numéro n'est pas réutilisé.

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
- [ ] Aucune donnée fictive en production (sites `TEST-…`, comptes `example.test`) :
      `scripts/ops/purge-demo-data.mjs` (`docs/go-live.md`, ligne 6).
- [ ] `CRON_SECRET` défini en production ; la tâche apparaît dans Vercel → Cron Jobs.

## 5. Suite de contrat `supabase` (`pnpm test:contract`)

Les suites de contrat tournent en permanence sur les fournisseurs `local` (`pnpm test:db`,
`pnpm test`) et, **uniquement contre le projet de test**, sur les fournisseurs `supabase` avec
`pnpm test:contract` (`scripts/ops/test-contract.mjs`). Pas à pas : `docs/go-live.md`, ligne 3.

La commande **refuse** de s'exécuter :

- sans `RONDE_CONTRACT_TARGET=test` ;
- s'il manque `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY`
  ou `DATABASE_URL` ;
- si `DATABASE_URL` et `SUPABASE_TEST_URL` visent deux projets différents ;
- si le projet visé est `SUPABASE_PROD_PROJECT_REF` (à définir avec l'identifiant de la
  production pour que la garde la reconnaisse).

Elle nettoie ce qu'elle crée : les comptes du contrat sont désactivés puis anonymisés (un
profil ne se supprime jamais, règle 22), l'objet `contract-…/photo.jpg` du bucket
`visit-photos` est supprimé.

## 5 bis. Tâches planifiées

`vercel.json` déclare la purge nocturne `/api/cron/purge` (2 h UTC, soit 3 h à Paris en hiver).
Elle exige `CRON_SECRET` en production (`docs/cron.md`) ; sans lui, la route répond 401 et rien
n'est purgé (les purges opportunistes des onglets continuent).

## 6. Accès de Claude Code

L'environnement Claude Code ne doit contenir **aucune clé de production** : seulement la base
locale (`DATABASE_URL` sur `127.0.0.1`) et, au besoin, les clés du projet de **test** pour les
suites de contrat. Les connecteurs (MCP Supabase, MCP Vercel) ne servent qu'en lecture ; toute
écriture distante est interdite par `CLAUDE.md`, et Claude Code doit s'arrêter et le signaler
si une tâche semble l'exiger.
