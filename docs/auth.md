# Authentification, comptes et journal d'audit

## Deux implémentations derrière `AuthService`

|            | `supabase` (production, par défaut)                                                                                                                   | `local` (tests et développement)                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identité   | Supabase Auth via `@supabase/ssr` ; `auth.getUser()` vérifie le jeton auprès du serveur Auth à chaque appel. **Jamais `getSession()`** pour un droit. | Comptes dans `auth.users` de la base locale (hash bcrypt), session dans le cookie `ronde_local_session` : JWT HS256 signé avec `LOCAL_AUTH_SECRET`, 8 h. |
| Comptes    | `admin.auth.admin.createUser` (service role) puis profil dans `withSystem` ; l'utilisateur Auth est supprimé si le profil échoue.                     | Insertion dans `auth.users` et `profiles` dans la même transaction.                                                                                      |
| Activation | `AUTH_PROVIDER=supabase` (défaut) + URL, clé anon et, pour l'admin, clé `service_role`.                                                               | `AUTH_PROVIDER=local` **et** `ALLOW_LOCAL_AUTH=true` **et** `LOCAL_AUTH_SECRET` (32 caractères min.).                                                    |

Garde-fous de `local` (vérifiés au démarrage par `src/lib/env.ts`, message explicite) :
refusé si `VERCEL` est défini ou si `DATABASE_URL` ne pointe pas sur `localhost` / `127.0.0.1`.

Dans les deux cas, le rôle et `is_active` sont **relus dans `profiles` à chaque requête**
(`getCurrentUser`) : un compte désactivé est déconnecté dès sa requête suivante, même avec
une session encore valide. Une suite de contrat commune (`tests/integration/auth-contract.test.ts`)
vérifie le même comportement ; elle tourne sur `local` en permanence et sur `supabase`
seulement si `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` et `SUPABASE_TEST_SERVICE_ROLE_KEY`
sont définis (ignorée sinon, avec un message).

## Accès aux données : `withUser` et `withSystem`

Toutes les lectures et écritures passent par une connexion Postgres directe (`pg` + Kysely),
dans une transaction courte :

- **`withUser(user, fn)`** : `set local role authenticated` + `request.jwt.claims = {"sub": id}`.
  La RLS de l'étape 2 s'applique exactement comme à travers l'API Supabase. `user` est
  l'utilisateur vérifié par `getCurrentUser` / `requireUser`.
- **`withSystem(reason, fn)`** : `set local role service_role` (hors RLS, comme la clé service
  de Supabase). Réservé aux services serveur explicites (session, comptes, import VIGIE) ;
  chaque appel nomme sa raison, journalisée. Interdit dans les pages et les composants
  (`server-only`). La connexion elle-même n'est jamais `postgres` en production : un rôle de
  connexion dédié, membre de `authenticated` et de `service_role`, suffit (voir
  `docs/supabase-setup.md`).

Les erreurs Postgres deviennent des erreurs métier : `42501` → `ForbiddenError`, `23505` →
`ConflictError`, `23514` / `22P02` / `23502` / `23503` → `ValidationError`, ligne absente →
`NotFoundError`, autre → `UnexpectedError` (détail dans les logs, message générique).

```ts
// Dans une page (Server Component)
export default async function ReservesPage() {
  const user = await requireUser(); // redirige vers /connexion?next=… ou /changer-mot-de-passe
  const reserves = await withUser(user, (trx) =>
    trx.selectFrom("reserves_with_state").select(["id", "code", "action", "is_overdue"]).execute(),
  );
  …
}

// Dans une page réservée à l'admin
const admin = await requireRole(["admin"]); // page 403 sinon

// Dans une action serveur
export async function createAccountAction(prev, formData) {
  "use server";
  const admin = await requireRoleForAction(["admin"]); // lève ForbiddenError, ne redirige pas
  …
}
```

Règles : jamais de `select *` (privilèges de colonnes sur `profiles`), requêtes Kysely
paramétrées, transactions courtes. Le middleware (`src/middleware.ts`) protège les routes et
rafraîchit la session, mais **chaque page et chaque action serveur appellent aussi
`requireUser` / `requireRole`** : le middleware ne suffit jamais seul et ne lit pas la base.

## Cycle de vie d'un compte

1. **Création par l'admin** (`/admin/comptes` → « Nouveau compte ») : nom, email (normalisé en
   minuscules, unique), rôle. Un **mot de passe provisoire** de 16 caractères est généré avec
   `crypto.getRandomValues` (alphabet sans caractères ambigus, ≈ 92 bits), affiché **une seule
   fois** avec un bouton « Copier », jamais journalisé ni stocké en clair. Le profil est créé
   avec `must_change_password = true`. Audit : `account.created`.
2. **Première connexion** : l'utilisateur est redirigé vers `/changer-mot-de-passe` et ne peut
   rien faire d'autre (sauf se déconnecter) tant qu'il n'a pas choisi un nouveau mot de passe :
   12 caractères minimum, au moins une lettre et un chiffre, différent du provisoire (le mot de
   passe actuel est demandé pour le prouver sans le stocker).
3. **Modification** (nom, rôle), **désactivation** / **réactivation** et **réinitialisation**
   (nouveau provisoire affiché une fois, `must_change_password = true`, audit
   `account.password_reset`) par l'admin, avec confirmation par dialogue.
4. Règles : impossible de se désactiver soi-même ou de retirer son propre rôle admin ;
   impossible de désactiver ou de rétrograder le **dernier admin actif**.

**Un compte ne se supprime jamais** : il se désactive. La base le garantit (trigger
`profiles_never_deleted`, clés `on delete restrict` depuis les tables d'historique), y compris si
quelqu'un supprime l'utilisateur depuis le tableau de bord Supabase : l'opération échoue avec le
message « RONDE: un compte ne se supprime pas, il se désactive (historique attribué) ». Une
anonymisation RGPD (nom et email remplacés) est prévue à l'étape 11.

Pas d'inscription libre ni de « mot de passe oublié » par email en V1. Les messages de
connexion sont génériques (« Email ou mot de passe incorrect »), sans révéler si le compte
existe ou s'il est désactivé.

## Journal d'audit

Les triggers de l'étape 2 tracent déjà les changements de `profiles` (`profile.role_changed`,
`profile.activated`, `profile.deactivated`). L'application ajoute, via `private.audit` dans
`withSystem` : `account.created`, `account.password_reset`, `auth.signed_in`,
`auth.sign_in_failed` (détails : hash SHA-256 tronqué de l'email, jamais l'email en clair) et
`auth.signed_out`. `/admin/journal` les affiche avec filtres (action, acteur, période) et
pagination (50 par page), en lecture seule.

## Cookies

`httpOnly`, `secure` en production, `sameSite=lax`, `path=/`. Les actions serveur Next
vérifient l'origine de la requête.

## Comptes de la seed (fournisseur `local` uniquement)

Mot de passe commun : **`Ronde-test-2026`** (hash bcrypt dans `supabase/seed.sql`).

| Email                           | Rôle      | Particularité                                |
| ------------------------------- | --------- | -------------------------------------------- |
| `rt.alice@example.test`         | rt        | créatrice de la visite V1                    |
| `rt.bruno@example.test`         | rt        | participant de V1, créateur de V2 (terminée) |
| `rt.emma@example.test`          | rt        | sans visite                                  |
| `direction.claire@example.test` | direction | lecture seule                                |
| `admin.david@example.test`      | admin     |                                              |
| `rt.inactif@example.test`       | rt        | désactivé : connexion refusée                |

En local : copiez `.env.example` en `.env.local`, renseignez `AUTH_PROVIDER=local`,
`ALLOW_LOCAL_AUTH=true`, `LOCAL_AUTH_SECRET` et `DATABASE_URL`, puis `pnpm db:reset` et
`pnpm dev`.
