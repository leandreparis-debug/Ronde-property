# Mise en production de RONDE 1.0.0

Liste de contrôle de Léandre, **dans l'ordre**. Chaque ligne indique la commande (PowerShell sur
le PC Windows, dans le dossier du dépôt) ou l'écran Vercel / Supabase concerné. Claude Code n'a
exécuté **aucune** de ces actions : elles touchent des environnements distants (règle absolue de
`CLAUDE.md`).

Conventions : `<ref-test>` et `<ref-prod>` sont les identifiants (20 caractères) des projets
Supabase de test et de production (Supabase → projet → Settings → General → Reference ID).

---

## 1. Connecteur Supabase de claude.ai déconnecté

claude.ai → **Settings → Connectors** → **Supabase** → **Disconnect** (faire de même pour
**Vercel** si l'on ne garde aucun accès en écriture). Vérifier qu'une nouvelle session Claude
Code ne liste plus d'outil `mcp__Supabase__*`.

## 2. Branche `main` et production depuis `main`

1. GitHub → dépôt → **Pull requests → New pull request** : base `main` (la créer si besoin :
   menu des branches → `main` → « Create branch main from claude/focused-allen-2pfr6m »),
   comparer `claude/focused-allen-2pfr6m`. Relire, attendre la CI verte, **fusionner**.
2. GitHub → **Settings → General → Default branch** = `main`.
3. Vercel → projet `ronde` → **Settings → Git → Production Branch** = `main`. Toute autre
   branche produit alors un déploiement de prévisualisation.

## 3. Projet de test sur Preview, migrations 1 à 20, suite de contrat

1. Vercel → **Settings → Environment Variables** → environnement **Preview** : les variables du
   tableau de la ligne 4 avec les valeurs du **projet de test** (`CRON_SECRET` inutile en
   Preview).
2. Migrations sur le projet de test :

   ```powershell
   pnpm db:migrations:list
   pnpm exec supabase link --project-ref <ref-test>
   pnpm exec supabase migration list
   pnpm exec supabase db push
   pnpm exec supabase migration list
   ```

   Toutes les versions jusqu'à `20261105170000` (migration 20) doivent apparaître côté _Remote_.
   **Ne jamais** ajouter `--include-seed` : la seed est fictive, et elle refuse d'ailleurs de
   s'exécuter ailleurs que dans la base locale `ronde_test` (garde en tête de `seed.sql`,
   `[db.seed] enabled = false` dans `supabase/config.toml`).

3. Suite de contrat (comptes et stockage du projet de test, nettoyés à la fin) :

   ```powershell
   $env:RONDE_CONTRACT_TARGET = "test"
   $env:SUPABASE_PROD_PROJECT_REF = "<ref-prod>"
   $env:SUPABASE_TEST_URL = "https://<ref-test>.supabase.co"
   $env:SUPABASE_TEST_ANON_KEY = "<clé anon du projet de test>"
   $env:SUPABASE_TEST_SERVICE_ROLE_KEY = "<clé service_role du projet de test>"
   $env:DATABASE_URL = "postgresql://postgres.<ref-test>:<mot de passe>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"
   pnpm test:contract
   ```

   Elle **refuse** de s'exécuter sans `RONDE_CONTRACT_TARGET=test`, si une variable manque, si
   `DATABASE_URL` et `SUPABASE_TEST_URL` visent deux projets différents, ou si le projet est
   `SUPABASE_PROD_PROJECT_REF`. Les comptes créés sont désactivés puis anonymisés (un profil ne
   se supprime jamais), les fichiers supprimés. Ensuite : `Remove-Item Env:*SUPABASE*`,
   `Remove-Item Env:DATABASE_URL`, `Remove-Item Env:RONDE_CONTRACT_TARGET`.

4. Ouvrir le déploiement Preview et dérouler la recette rapide de la ligne 11.

## 4. Variables de production dans Vercel

Vercel → **Settings → Environment Variables** → environnement **Production** :

| Variable                        | Valeur                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://<ref-prod>.supabase.co`                                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon / publishable de production                                              |
| `SUPABASE_SERVICE_ROLE_KEY`     | clé service_role de production (**serveur uniquement**)                           |
| `DATABASE_URL`                  | pooler **transaction** (port 6543) du rôle `ronde_app` (`docs/supabase-setup.md`) |
| `DATABASE_POOL_MAX`             | `5`                                                                               |
| `CRON_SECRET`                   | 48 caractères aléatoires (`docs/cron.md`)                                         |
| `AUTH_PROVIDER`                 | `supabase` (ou absente)                                                           |
| `STORAGE_PROVIDER`              | `supabase` (ou absente)                                                           |

**Interdites** dans tous les environnements Vercel : `ALLOW_LOCAL_AUTH`, `LOCAL_AUTH_SECRET`,
`ALLOW_LOCAL_STORAGE`, `LOCAL_STORAGE_SECRET`, `LOCAL_STORAGE_DIR` (l'application refuse de
démarrer avec un fournisseur `local` sur Vercel).

## 5. Migrations 15 à 20 sur la production

```powershell
pnpm exec supabase link --project-ref <ref-prod>
pnpm exec supabase migration list
pnpm exec supabase db push
pnpm exec supabase migration list
```

Versions attendues (vérifier avec `pnpm db:migrations:list`) :

| N°  | Version          | Contenu                                                                        |
| --- | ---------------- | ------------------------------------------------------------------------------ |
| 15  | `20261104090000` | pages de plans, statut d'envoi, contrôles des repères, purge                   |
| 16  | `20261104120000` | version des réserves, responsable facultatif, vue enrichie                     |
| 17  | `20261105090000` | compteur des repères, rapports `pending` → `ready`                             |
| 18  | `20261105150000` | révocation des sessions, vues en lecture seule, aucun droit pour `anon`        |
| 19  | `20261105160000` | RGPD : e-mails hors historique, anonymisation, effacement des e-mails externes |
| 20  | `20261105170000` | avis du pilote (`feedback`)                                                    |

Toutes s'appliquent **avant** le déploiement du code 1.0.0 (colonnes facultatives, fonctions
nouvelles), sans interruption pour le code en place.

## 6. Suppression des données de démonstration en production

`scripts/ops/purge-demo-data.mjs` supprime les sites `TEST-…`, les comptes `@example.test`,
leurs visites et tout ce qui s'y rattache (réserves et leur historique compris), les fichiers de
stockage et les identités de connexion, en **une transaction** ; il vérifie qu'aucune référence
orpheline ne reste avant de valider. Il **conserve** le compte admin de Léandre.

```powershell
$env:DATABASE_URL = "postgresql://postgres.<ref-prod>:<mot de passe>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"
node scripts/ops/purge-demo-data.mjs --project-ref <ref-prod> --keep-admin <e-mail de Léandre> --dry-run
```

Lire le bilan (« Conservé », « À supprimer »). Le script **refuse** :

- une `DATABASE_URL` qui ne vise pas `<ref-prod>` (avant toute lecture) ;
- un compte ou un site inconnu de la seed, sans `--keep-unknown` (vérifier la liste, puis
  relancer avec `--keep-unknown` pour les garder) ;
- toute donnée réelle qui dépend d'une donnée de démonstration (elle est listée).

Puis, pour supprimer (saisir `<ref-prod>` quand il est demandé) :

```powershell
$env:SUPABASE_URL = "https://<ref-prod>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<clé service_role de production>"
node scripts/ops/purge-demo-data.mjs --project-ref <ref-prod> --keep-admin <e-mail de Léandre> --apply
Remove-Item Env:DATABASE_URL, Env:SUPABASE_URL, Env:SUPABASE_SERVICE_ROLE_KEY
```

Trace : `/admin/journal` → « Données de démonstration supprimées ». Le script met en pause les
triggers pour sa transaction (`session_replication_role = replica`) afin d'atteindre les tables
en ajout seul ; si Supabase le refuse (« permission denied »), rien n'est modifié : prévenir
Claude Code, qui proposera une alternative.

**La seed n'est jamais appliquée en production** : `supabase db push` n'applique que les
migrations (pas `seed.sql`) ; `--include-seed` ne doit jamais être utilisé ; et `seed.sql`
s'arrête de lui-même si la base n'est pas `ronde_test`.

## 7. Import du vrai référentiel VIGIE

1. Récupérer l'export CSV de VIGIE. **En-têtes réels à confirmer** : comparer la première ligne
   avec `FIELD_ALIASES` dans `src/server/sites/import/format.ts` (alias acceptés par champ) ;
   s'il manque un alias, l'ajouter (avec son test) **avant** l'import — demander à Claude Code.
2. RONDE → `/admin/sites/import` → choisir le fichier → **Simuler l'import** → lire le bilan
   (créations, rejets avec la raison) → **Appliquer l'import**.
3. Cocher « Ce fichier contient tout le référentiel » seulement si l'export est complet.

## 8. Comptes des RT pilotes et de la direction

`/admin/comptes` → **Nouveau compte** pour chaque personne (rôle RT ou Direction). Transmettre
chaque mot de passe provisoire **de vive voix ou par téléphone** (il n'est affiché qu'une fois).

## 9. Réglages Supabase (production)

- **Durée de session** : Authentication → Sessions → _Time-box user sessions_ **12 h**,
  _Inactivity timeout_ **8 h** (si l'offre le permet ; `docs/security.md`).
- **E-mail de réinitialisation en français** : Authentication → Emails → _Reset password_ :
  sujet « RONDE : réinitialisation de votre mot de passe », corps :
  « Bonjour, une réinitialisation de votre mot de passe RONDE a été demandée. Pour choisir un
  nouveau mot de passe, ouvrez ce lien : {{ .ConfirmationURL }}. Si vous n'êtes pas à l'origine
  de cette demande, ignorez ce message. » (Dans RONDE, c'est l'admin qui réinitialise : ce modèle
  ne sert qu'en secours.)
- **URL** : Authentication → URL Configuration → _Site URL_ = l'adresse de production ;
  _Redirect URLs_ = l'adresse de production et `https://*-<équipe>.vercel.app` (Preview).
- **Région** : Settings → General → région du projet (Europe, idéalement `eu-west-3` Paris),
  à reporter dans `docs/rgpd.md`.
- **Sauvegardes** : Database → Backups : sauvegardes quotidiennes actives ; envisager la
  restauration à un instant donné (PITR) si l'offre le permet.
- **Inscriptions** : Authentication → Providers → Email → _Allow new users to sign up_
  **désactivé** (les comptes sont créés par l'admin).

## 10. Dimensionnement du stockage

Hypothèses mesurées (étape 10) : photo de **320 Ko** (1 600 px) + miniature 40 Ko, **40 photos
par visite**, rapport d'environ **12 Mo** en qualité « Standard » (1,5 rapport par visite :
brouillon puis final), plans d'environ 15 Mo par site.

```powershell
node scripts/ops/storage-estimate.mjs --rt <nombre de RT> --visites <visites par RT et par mois> --sites <sites avec plans>
```

Exemple : 10 RT, 6 visites par mois chacun, 80 sites avec plans :

| Poste                 | Volume            |
| --------------------- | ----------------- |
| Visites               | 60 par mois       |
| Photos et miniatures  | 0,8 Go par mois   |
| Rapports              | 1,1 Go par mois   |
| Plans                 | 1,2 Go (une fois) |
| **Total sur 12 mois** | **23,7 Go**       |

À comparer avec le quota de stockage du plan Supabase (Settings → Billing → Usage) ; prévoir
une alerte à 80 %. Nombre de RT et de visites par mois **à renseigner par Léandre** avant le
pilote.

## 11. Recette rapide en production

Sur un site de test réel (ou un site peu sensible), avec un compte RT de Léandre :

1. Connexion, création d'une visite, une note, une photo, un repère sur un plan, une réserve.
2. Génération du rapport (PDF téléchargé, ligne dans l'historique).
3. Connexion en Direction : lecture seule, téléchargement du rapport.
4. « Donner mon avis » puis lecture dans `/admin/avis`.
5. `/api/cron/purge` : Vercel → Cron Jobs → **Run** ; `/admin/journal` affiche « Purge
   planifiée ».
6. **Supprimer** la visite de test (Actions → Supprimer) ; la purge nocturne et la suppression
   logique la retirent des listes.

## 12. Communication aux pilotes et arrêt progressif de CR Visites

1. Message aux RT pilotes : lien de RONDE, guide (`/aide`, ou `docs/guide-rt.md`), installation
   sur la tablette, « Donner mon avis ».
2. Période de double usage (2 à 4 semaines) : CR Visites reste consultable, les nouvelles
   visites se font dans RONDE.
3. Point hebdomadaire sur `/admin/avis` (notes 1 et 2, « Ce qui bloque ») ; décision d'arrêt de
   CR Visites à la fin du pilote (critère 6 du cahier des charges).
