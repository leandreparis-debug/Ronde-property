# Mettre en place Supabase pour RONDE

Guide écrit pour Léandre, sur un PC Windows **sans Docker**. Il couvre la création du projet,
l'application des migrations, la vérification des buckets et la configuration des variables.

> Règles d'or
>
> - N'exécutez **jamais** `supabase/seed.sql` ni `supabase/tests/bootstrap.sql` sur le vrai projet.
>   Ils ne servent qu'à la base de test locale `ronde_test`.
> - Ne modifiez jamais une migration déjà commitée : toute correction est une nouvelle migration.
> - Les clés ne vont que dans `.env.local` (ignoré par git) et dans les variables Vercel.

## 1. Créer le projet Supabase

1. Connectez-vous sur <https://supabase.com/dashboard> et créez une organisation si besoin.
2. **New project** :
   - Name : `ronde` (ou `ronde-v1`) ;
   - Database password : générez-le et conservez-le dans le gestionnaire de mots de passe de
     l'équipe. Il ne sert qu'à la CLI et aux outils SQL, jamais à l'application ;
   - Region : **West EU (Paris)** si disponible, sinon **Central EU (Frankfurt)** ;
   - Plan : Free suffit pour la recette, Pro pour la production (sauvegardes quotidiennes).
3. Attendez que le projet soit « Healthy » (2 à 3 minutes).

## 2. Appliquer les migrations

Les migrations sont dans `supabase/migrations/`, à appliquer **dans l'ordre des noms de
fichiers** (préfixe horodaté). Deux méthodes.

### Méthode A : CLI Supabase pour Windows (recommandée)

La CLI ne nécessite **pas** Docker pour `link` et `db push`.

1. Installez la CLI avec Scoop (dans PowerShell) :

   ```powershell
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase
   ```

   Ou téléchargez l'archive Windows depuis
   <https://github.com/supabase/cli/releases> et placez `supabase.exe` dans le PATH.

2. Dans le dossier du dépôt :

   ```powershell
   supabase login
   supabase link --project-ref <ref-du-projet>
   supabase db push
   ```

   `<ref-du-projet>` est l'identifiant visible dans l'URL du dashboard
   (`https://supabase.com/dashboard/project/<ref>`). `db push` demande le mot de passe de la
   base et applique uniquement les migrations non encore appliquées, dans l'ordre.

3. Pour vérifier : `supabase migration list` doit montrer toutes les migrations en « Remote ».

### Méthode C (désormais interdite à Claude Code) : connecteur Supabase (MCP) depuis Claude Code

Chaque fichier peut être appliqué dans l'ordre avec l'outil `apply_migration` du connecteur,
qui l'enregistre dans `supabase_migrations.schema_migrations` sous son nom. C'est ainsi que le
projet `ronde` a été initialisé le 3 novembre 2026 (treize migrations), puis que la migration 14
a été appliquée pendant l'étape 7. **Depuis le 4 novembre 2026, cette méthode est interdite à
Claude Code** (règle en tête de `CLAUDE.md`) : les migrations distantes sont appliquées par
Léandre avec la méthode A, selon `docs/deploy.md`.

### Méthode B : éditeur SQL du dashboard

1. Ouvrez **SQL Editor** dans le dashboard.
2. Pour chaque fichier de `supabase/migrations/`, **dans l'ordre** :
   `20261102100000_…`, `20261102100100_…`, … jusqu'à `20261102100700_…`, copiez tout le contenu,
   collez-le, puis **Run**. Chaque fichier doit se terminer sans erreur avant de passer au
   suivant.
3. Inconvénient : la table `supabase_migrations.schema_migrations` n'est pas renseignée, donc un
   futur `supabase db push` voudra tout rejouer. Si vous commencez par la méthode B, restez-y
   ou marquez les migrations comme appliquées avec `supabase migration repair --status applied
<version>` avant de passer à la méthode A.

## 3. Vérifier

Dans **SQL Editor** :

```sql
-- Tables et RLS
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
-- Toutes les lignes doivent avoir rowsecurity = true.

-- Buckets
select id, public, file_size_limit, allowed_mime_types from storage.buckets order by 1;
-- Attendu : reports, site-plans, visit-photos, tous public = false.

-- Fonctions
select proname from pg_proc where pronamespace = 'private'::regnamespace order by 1;
```

Dans **Storage**, les trois buckets apparaissent avec le cadenas « private ». Vérifiez en
particulier `visit-photos` : privé, 15 Mo par objet, types `image/jpeg`, `image/png`,
`image/webp`. Les photos de l'étape 7 y sont déposées directement par le navigateur
(`{visit_id}/{photo_id}.jpg` et `{visit_id}/{photo_id}_thumb.jpg`), via des URL signées par le
serveur avec la clé `service_role` : `SUPABASE_SERVICE_ROLE_KEY` est donc **obligatoire** sur
Vercel dès cette étape (voir `docs/storage.md`).

**Volume** : comptez environ 400 Ko par photo (image 1600 px et miniature), soit environ 20 Mo
pour une visite de 50 photos et 1 Go pour 50 visites ; l'offre gratuite de Supabase (1 Go)
suffit à la recette, pas à la production.

## 4. Récupérer l'URL et les clés

Dashboard → **Project Settings** → **API** (ou **Data API** / **API Keys** selon la version) :

| Valeur                                    | Variable                        | Où                                                  |
| ----------------------------------------- | ------------------------------- | --------------------------------------------------- |
| Project URL (`https://<ref>.supabase.co`) | `NEXT_PUBLIC_SUPABASE_URL`      | `.env.local` et Vercel (tous environnements)        |
| Clé **anon** / **publishable**            | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` et Vercel (tous environnements)        |
| Clé **service_role** / **secret**         | `SUPABASE_SERVICE_ROLE_KEY`     | `.env.local` et Vercel, **côté serveur uniquement** |

Les deux premières sont publiques par conception (la RLS protège les données). La clé
`service_role` contourne la RLS : ne la mettez jamais dans une variable `NEXT_PUBLIC_*`, dans
le code, dans un ticket ou dans un message.

### `.env.local` (poste de développement)

```dotenv
NEXT_PUBLIC_APP_NAME=RONDE
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clé anon>
SUPABASE_SERVICE_ROLE_KEY=<clé service_role>
```

Au démarrage, `src/lib/env.ts` vérifie le format : une URL mal formée arrête l'application
avec un message explicite.

### Vercel

Project → **Settings** → **Environment Variables** : ajoutez les trois variables Supabase
pour Production et Preview. Redéployez après modification.

## 4 bis. Authentification (étape 3)

Dashboard → **Authentication** :

- **Providers → Email** : laissez « Enable Email provider » activé, **désactivez « Confirm
  email »** (les comptes sont créés par l'admin avec `email_confirm: true`, aucune confirmation
  n'est envoyée).
- **Sign In / Providers → Allow new users to sign up** : **désactivé** (pas d'inscription libre).
- **URL Configuration → Site URL** : l'URL de production (`https://ronde.exemple.fr`) ; ajoutez
  les URL de preview Vercel dans « Redirect URLs » si besoin.

### Premier compte admin

Tant qu'aucun admin n'existe, l'écran `/admin/comptes` est inaccessible. Créez le premier
compte depuis le dashboard (ou, à défaut, par une insertion SQL dans `auth.users`,
`auth.identities` et `profiles` avec `extensions.crypt(mot_de_passe, extensions.gen_salt('bf'))`
et `email_confirmed_at = now()`, puis `must_change_password = true`) :

1. **Authentication → Users → Add user → Create new user** : email de l'admin, un mot de passe
   provisoire fort, cochez **Auto Confirm User**.
2. Copiez l'**UUID** de l'utilisateur créé.
3. **SQL Editor**, en remplaçant l'UUID et l'email :

   ```sql
   insert into public.profiles (id, email, full_name, role, is_active, must_change_password)
   values ('<uuid>', 'prenom.nom@exemple.fr', 'Prénom Nom', 'admin', true, true);
   ```

4. Connectez-vous sur `/connexion` : l'application impose le changement du mot de passe, puis
   `/admin/comptes` permet de créer les autres comptes.

### Rôle de connexion dédié et `DATABASE_URL` du pooler (mode transaction)

L'application ne se connecte **pas** avec `postgres`. Créez un rôle de connexion dédié, membre
de `authenticated` (pour `withUser`) et de `service_role` (pour `withSystem`, qui fait
`set local role service_role`) :

```sql
create role ronde_app with login password '<mot-de-passe-fort>' noinherit;
grant authenticated to ronde_app;
grant service_role to ronde_app;
```

Puis, dashboard → **Connect** (en haut) → **Transaction pooler** (port **6543**), en
remplaçant l'utilisateur par le rôle dédié :

```
postgres://ronde_app.<ref>:<mot-de-passe>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

Encodez le mot de passe s'il contient des caractères spéciaux (`@` → `%40`). Le mode
transaction convient à Vercel (serverless) ; `DATABASE_POOL_MAX` reste petit (5 par défaut).
La migration 13 accorde `private.audit` à `service_role`, nécessaire au journal d'audit écrit
depuis `withSystem`.

### Variables à créer dans Vercel

| Variable                        | Valeur                    | Exposée au navigateur ? |
| ------------------------------- | ------------------------- | ----------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL du projet             | oui                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon / publishable    | oui                     |
| `SUPABASE_SERVICE_ROLE_KEY`     | clé service_role / secret | **non**                 |
| `DATABASE_URL`                  | pooler transaction (6543) | **non**                 |
| `DATABASE_POOL_MAX`             | `5` (optionnel)           | non                     |
| `AUTH_PROVIDER`                 | `supabase` (ou absente)   | non                     |
| `STORAGE_PROVIDER`              | `supabase` (ou absente)   | non                     |

Ne définissez **jamais** `ALLOW_LOCAL_AUTH`, `LOCAL_AUTH_SECRET`, `ALLOW_LOCAL_STORAGE`,
`LOCAL_STORAGE_SECRET` ni `LOCAL_STORAGE_DIR` sur Vercel : les fournisseurs `local` y sont
refusés au démarrage, et la route `/api/local-storage` répond 404 sous tout autre fournisseur.

## 5. Base de test locale (facultatif sur Windows)

Les tests de base (`pnpm test:db`) tournent sur un PostgreSQL local, sans Docker :

1. Installez PostgreSQL 16 (<https://www.postgresql.org/download/windows/>), mot de passe
   `postgres` pour l'utilisateur `postgres`, port 5432.
2. Dans le dépôt : `pnpm db:reset` puis `pnpm test:db`.

`pnpm db:reset` supprime et recrée **uniquement** la base `ronde_test` sur localhost, puis
applique `bootstrap.sql`, les migrations et `seed.sql`. Il refuse toute autre base ou tout autre
hôte. La CI fait la même chose avec un service PostgreSQL.

## 6. Après une nouvelle migration

1. `pnpm db:reset && pnpm test:db` en local.
2. `pnpm db:types` pour régénérer `src/server/db/database.types.ts`, puis commit.
3. `supabase db push` (ou méthode B) sur le projet.
