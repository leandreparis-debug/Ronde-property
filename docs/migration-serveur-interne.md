# Migration vers le serveur interne (V2)

La V1 tourne sur **Vercel** (application) et **Supabase** (Postgres, authentification,
stockage). La V2 tournera sur un **serveur interne** de Carrefour Property, sans dépendance à un
service externe. Ce document décrit ce qui change, ce qui est déjà prêt, la reprise des données
et les risques. Rien n'est à faire avant la décision de migrer.

## Ce qui est déjà abstrait

| Couche                | Interface                                                         | Implémentations aujourd'hui        | V2                                          |
| --------------------- | ----------------------------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| Authentification      | `AuthService`, `AccountAdminService` (`src/server/auth/types.ts`) | `supabase`, `local` (tests)        | **SSO MERLIN** (OIDC/SAML, à confirmer)     |
| Stockage des fichiers | `StorageService` (`src/server/storage/types.ts`)                  | `supabase`, `local` (tests)        | disque du serveur ou stockage S3 interne    |
| Base de données       | Kysely + `pg` sur une `DATABASE_URL` (`src/server/db/`)           | Postgres de Supabase, `ronde_test` | Postgres interne (16 ou plus)               |
| Tâches planifiées     | route `/api/cron/purge` + `CRON_SECRET`                           | Vercel Cron (`vercel.json`)        | `cron` / timer systemd qui appelle la route |
| Polices, rapport PDF  | fichiers locaux (`public/fonts/`), rendu dans le navigateur       | aucun appel externe                | inchangé                                    |

Points forts pour la migration :

- **Aucun appel direct à Supabase hors de `src/server/`** (règle ESLint) : les écrans ne
  connaissent que les interfaces ci-dessus.
- **L'accès aux données ne dépend pas de PostgREST** : l'application parle à Postgres directement
  (`withUser` pose le rôle `authenticated` et l'identité dans `request.jwt.claims` ; `withSystem`
  pose `service_role`). Les politiques RLS, triggers et fonctions restent valables tels quels.
- **Les contrats sont testés** : `tests/integration/auth-contract.test.ts` et
  `tests/server/storage/contract.test.ts` définissent ce qu'une nouvelle implémentation doit
  respecter (connexion, sessions, révocation, anonymisation ; URL signées, tailles, types).
- **Aucune ressource externe au build ni à l'exécution** (polices locales, pas de CDN, CSP
  `self`).

## Ce qui change

### Postgres

1. Créer la base, puis appliquer `supabase/tests/bootstrap.sql` : il **émule** ce que Supabase
   fournit (rôles `anon`, `authenticated`, `service_role`, schéma `auth` avec `auth.users`,
   `auth.uid()`, `auth.jwt()`, schéma `storage` minimal). C'est exactement ce que fait
   `pnpm db:reset` pour `ronde_test`. Le relire et le durcir pour la production (il est écrit
   pour les tests).
2. Appliquer toutes les migrations de `supabase/migrations/` dans l'ordre (comme
   `scripts/db/reset.mjs`, **sans** la seed).
3. Créer le rôle de connexion de l'application (membre de `authenticated` et de `service_role`,
   comme `ronde_app` : `docs/supabase-setup.md`).

### Authentification : SSO MERLIN

- Écrire `src/server/auth/merlin-auth.ts` qui implémente `AuthService` : `signIn` redirige vers
  le fournisseur d'identité ; `getVerifiedSession` vérifie la signature du jeton (ou de la
  session) et renvoie l'identité et **l'heure de connexion** (comparée à
  `profiles.sessions_revoked_at`).
- Rattacher chaque identité MERLIN à un `profiles.id` existant (par l'e-mail professionnel, une
  seule fois, au premier passage) : les rôles RONDE restent gérés dans RONDE.
- Les mots de passe disparaissent : `changePassword`, `resetPassword` et le mot de passe
  provisoire n'ont plus d'objet (les écrans correspondants se masquent).
- Faire passer la suite de contrat (adapter les cas propres aux mots de passe).

### Stockage

- Implémenter `StorageService` sur le disque du serveur (en reprenant `local.ts`, déjà signé
  par HMAC, et en levant ses garde-fous « tests uniquement » pour un fournisseur `disk` dédié)
  ou sur un stockage compatible S3 interne.
- Les URL signées restent courtes (10 minutes) et délivrées après une lecture sous RLS (règle 28).
- Mettre à jour la CSP : l'origine du stockage dans `img-src` et `connect-src`
  (`src/lib/security/csp.ts`), si elle diffère de celle de l'application.

### Application

- `pnpm build` puis `pnpm start` (Node 22) derrière un proxy inverse (nginx) en **HTTPS** ; les
  en-têtes de sécurité et la CSP sont posés par l'application.
- Variables : celles de `docs/deploy.md` sans les variables Supabase, plus celles du SSO et du
  stockage. Les fournisseurs `local` restent interdits hors tests.
- **Tâches planifiées** : un timer systemd (ou une ligne `cron`) à 3 h, heure de Paris
  (le serveur connaît le fuseau, plus de conversion UTC) :

  ```
  0 3 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://ronde.interne/api/cron/purge
  ```

- Journaux : `src/server/log.ts` écrit du JSON sur la sortie standard ; les rediriger vers le
  collecteur de journaux interne.

## Reprise des données et des fichiers

1. **Gel** : annoncer une fenêtre (soir), passer la V1 en lecture seule (désactiver les comptes
   RT dans `/admin/comptes`, ou couper l'application).
2. **Base** : `pg_dump --data-only --schema=public` du projet Supabase (avec la chaîne de
   connexion du _session pooler_), puis restauration dans la base interne déjà migrée. Les
   identifiants (UUID) sont conservés ; les triggers sont mis en pause pendant la restauration
   (`session_replication_role = replica`, en superutilisateur) pour ne pas réécrire l'historique.
3. **Comptes** : recréer les lignes `auth.users` (id et e-mail) à partir de `profiles` ; les
   mots de passe ne sont pas repris (le SSO les remplace).
4. **Fichiers** : télécharger les buckets `visit-photos`, `site-plans` et `reports` (API de
   stockage avec la clé service_role, ou `supabase storage cp -r`) et les déposer à la même
   arborescence (`{visit_id}/{photo_id}.jpg`, `{site_id}/{plan_id}/…`, `{visit_id}/{report_id}.pdf`) :
   les chemins enregistrés en base restent valables.
5. **Contrôles** : nombre de lignes par table identique ; pour chaque `photos`, `site_plans`,
   `site_plan_pages`, `reports` en `ready`, le fichier existe et sa taille correspond ; recette
   C1 à C6 (`pnpm test:acceptance` adaptée à l'URL interne) ; un rapport existant se retélécharge
   à l'identique (même SHA-256).
6. **Bascule** : DNS ou lien vers le serveur interne ; la V1 reste consultable en lecture
   quelques semaines, puis les projets Vercel et Supabase sont supprimés (après export d'archive).

## Risques

| Risque                                                      | Parade                                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Écart entre `bootstrap.sql` (émulation) et le vrai Supabase | la suite `pnpm test:db` tourne déjà sur l'émulation : l'étendre aux cas de production        |
| SSO MERLIN : identités sans e-mail ou e-mails changés       | rapprochement fait une fois, table de correspondance conservée, contrôle par l'admin         |
| Volume des fichiers (plusieurs dizaines de Go)              | copie incrémentale avant la fenêtre, puis seulement le delta pendant le gel                  |
| Historique en ajout seul (`audit_log`, `reserve_events`)    | restauration en `session_replication_role = replica`, aucune réécriture                      |
| Certificats et HTTPS internes (installation sur tablette)   | certificat de l'autorité interne installé sur les tablettes, sinon l'installation PWA échoue |
| Sauvegardes                                                 | sauvegarde quotidienne de la base et des fichiers, restauration testée avant la bascule      |
| Un seul développeur                                         | `docs/reprise.md`, contrats testés, CI complète                                              |
