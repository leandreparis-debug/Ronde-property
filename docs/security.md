# Sécurité

Synthèse des protections de RONDE (étape 11). Les règles d'accès aux données vivent dans la base
(RLS, triggers, RPC : `docs/data-model.md`) ; l'application ne les duplique que pour l'ergonomie.

## En-têtes HTTP

| En-tête                     | Valeur                                                                             | Où                  |
| --------------------------- | ---------------------------------------------------------------------------------- | ------------------- |
| `Content-Security-Policy`   | voir ci-dessous, nonce neuf à chaque requête                                       | `src/middleware.ts` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` (ignoré en HTTP local)                       | `next.config.ts`    |
| `X-Content-Type-Options`    | `nosniff`                                                                          | `next.config.ts`    |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                  | `next.config.ts`    |
| `X-Frame-Options`           | `DENY` (doublé par `frame-ancestors 'none'`)                                       | `next.config.ts`    |
| `Permissions-Policy`        | `camera=(self)` seulement ; micro, géolocalisation, paiement, USB… refusés (`=()`) | `next.config.ts`    |
| `X-Powered-By`              | absent (`poweredByHeader: false`)                                                  | `next.config.ts`    |

### Content-Security-Policy (`src/lib/security/csp.ts`)

```
default-src 'self';
script-src 'self' 'nonce-…' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data: https://<projet>.supabase.co;
font-src 'self' data:;
connect-src 'self' https://<projet>.supabase.co wss://<projet>.supabase.co;
media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'; frame-src 'self' blob:;
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

- **Scripts** : aucun script en ligne sans le nonce de la requête, ni `eval` (`'unsafe-eval'`
  seulement avec `pnpm dev`). Pour que Next.js pose le nonce, chaque page est rendue à la
  requête (`connection()` dans `src/app/layout.tsx`).
- **Zod** passe en mode `jitless` dans le navigateur (`src/components/zod-jitless.tsx`) : sa
  détection de `Function("")` était signalée comme violation.
- **Styles** : `'unsafe-inline'` reste nécessaire (attributs `style` de React, `next/font`) ; un
  style ne peut pas exécuter de code.
- **Supabase** : l'origine vient de `NEXT_PUBLIC_SUPABASE_URL` (aucune URL en dur) ; absente avec
  les fournisseurs locaux.
- **Contrôle** : `e2e/helpers/csp.ts` fait échouer **tout** test Playwright (suite e2e et recette)
  au moindre événement `securitypolicyviolation`, y compris dans les contextes ouverts par le
  test ; `e2e/navigation.spec.ts` vérifie le nonce (neuf à chaque requête, porté par chaque
  script).

## Sessions

| Fournisseur | Durée                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `supabase`  | jeton d'accès de **1 h** renouvelé par le jeton de rafraîchissement (rotation activée) ; sans limite de durée par défaut, voir la recommandation ci-dessous. |
| `local`     | jeton signé (HS256) valable **8 h**, cookie `httpOnly`, `SameSite=Lax` (tests et développement uniquement).                                                  |

Cookies : `httpOnly`, `Secure` en production, `SameSite=Lax`, chemin `/`. À chaque requête,
l'identité est vérifiée (`getUser()` côté Supabase, signature en local), puis le profil relu en
base : un compte désactivé ou dont les sessions ont été révoquées est renvoyé vers la connexion.

**Recommandation pour la production** (réglage du tableau de bord Supabase, à faire par
Léandre, listé dans `docs/go-live.md`) : Authentication → Sessions → _Time-box user sessions_
**12 h** et _Inactivity timeout_ **8 h** (une journée de visite), si l'offre le permet.

### Déconnecter toutes les sessions

- Bouton **« Déconnecter toutes les sessions »** sur chaque compte actif (`/admin/comptes`), avec
  confirmation ; aussi déclenché par la **réinitialisation du mot de passe** et par la
  **désactivation** (trigger, migration 18). Audit `profile.sessions_revoked` (motif `admin` ou
  `deactivated`).
- Mécanisme commun aux deux fournisseurs : `profiles.sessions_revoked_at` (réservée au service,
  tronquée à la seconde) est comparée à **l'heure de connexion** de la session : claim
  `auth_time` du jeton local, `amr` du jeton Supabase (conservé au rafraîchissement, donc un
  jeton de rafraîchissement volé ne sert plus à rien). L'API d'administration de Supabase ne
  peut pas déconnecter un autre utilisateur sans son jeton, d'où ce contrôle côté application.
- Tests : contrat `AuthService` (`tests/integration/auth-contract.test.ts`, deux « appareils »
  déconnectés, nouvelle connexion acceptée), base (`supabase/tests/migration18.test.ts`), e2e
  (`e2e/admin.spec.ts`).

## Copie locale hors réseau (étape 12)

Une visite gardée hors réseau est copiée sur l'appareil (IndexedDB, `docs/offline.md`). Ce que
cela implique, et les limites posées :

- **Ce qui est copié** : seulement les visites **en cours** que l'utilisateur peut modifier, et
  seulement celles gardées (bouton, ou ouverture sur tablette). Jamais la liste des sites, les
  comptes, le journal ni les visites des autres. Les e-mails des responsables externes d'une
  réserve sont dans la copie (détail de la réserve), comme à l'écran ; ils ne sont dans aucun
  journal ni aucune file.
- **Aucun secret dans IndexedDB ni `localStorage`** : ni jeton, ni mot de passe, ni URL
  signée durable. La session reste dans le cookie `httpOnly`. `localStorage` ne garde que
  l'identifiant, le nom et le rôle du dernier utilisateur (`ronde.offline.user`), pour ouvrir
  la bonne base hors ligne. Les URL signées des images ne servent qu'au téléchargement ; les
  images gardées sont des `Blob` locaux.
- **Une base par utilisateur** (`ronde-<userId>`) : un autre compte sur la même tablette ne voit
  jamais la copie du précédent (test e2e « deux comptes »).
- **Effacement** de la base de l'utilisateur :
  - à la **déconnexion** (avec un avertissement si des modifications n'ont pas été envoyées :
    elles seraient perdues). Si un autre onglet retient la base, l'effacement est terminé sur
    la page de connexion (`ronde.offline.wipe`) ;
  - au premier contact avec le serveur après **« Déconnecter toutes les sessions »** ou la
    **désactivation** du compte (`401` avec la raison `revoked` / `inactive`, puis
    `/connexion?session=revoquee|desactive`, qui l'annonce) ;
  - après **14 jours sans contact** avec le serveur (vérifié à l'ouverture).
- **Session expirée** pendant le travail hors réseau : la file est **gardée** (rien n'est
  perdu) et mise en pause ; « Se reconnecter » la relance.
- **Serveur** : `POST /api/sync` appelle `requireUser` puis exige le rôle `rt` ou `admin`
  (direction : `403`) ; chaque opération est validée par le schéma zod partagé et appliquée
  dans sa propre transaction `withUser` par les mêmes services que les écrans : la RLS, les
  triggers et les règles métier s'appliquent à l'identique. `sync_operations` (idempotence) est
  réservée au service (aucun droit pour `anon` / `authenticated`, test
  `supabase/tests/rls-audit.test.ts`) et purgée après 30 jours.
- **Service worker** : n'intercepte jamais `/api/*`, une requête autre que `GET` ni une autre
  origine ; aucune page avec des données n'est mise en cache (`docs/pwa.md`).

**Limites connues** : la copie n'est pas chiffrée au repos par l'application (elle dépend du
chiffrement de l'appareil : code de verrouillage obligatoire sur les tablettes, à rappeler aux
RT) ; une tablette volée **déverrouillée** et jamais reconnectée garde sa copie jusqu'à
14 jours. En cas de perte : « Déconnecter toutes les sessions » sur le compte (la copie est
effacée au premier contact), et changer le mot de passe.

## Audit RLS automatique

`supabase/tests/rls-audit.test.ts` (dans `pnpm test:db`) fait échouer la CI si :

- une table de `public` (ou `storage.objects`) n'a pas la RLS activée ;
- une table n'a aucune politique, hors liste explicite des tables du service
  (`plan_marker_counters`, sans aucun droit pour les utilisateurs) ;
- une politique vise `anon` ou `public`, ou s'ouvre à tous (`using (true)`) ;
- `anon` a un droit sur une table ou une vue ; `authenticated` peut faire `TRUNCATE` (qui ignore
  la RLS) ;
- une vue n'est pas `security_invoker` ou accepte autre chose que `SELECT` ;
- une fonction `SECURITY DEFINER` n'a pas de `search_path` fixé, ou est appelable par `anon` ;
- l'e-mail ou la date de révocation de `profiles` est lisible par les utilisateurs.

La matrice des droits par rôle reste dans `supabase/tests/matrix.test.ts`.

## Dépendances et secrets

- **`pnpm audit --prod`** dans la CI (job _verify_). Les failles de `postcss` et `sharp`, tirés
  par Next.js 15.5.28, sont corrigées par `pnpm.overrides` (`package.json`) : à retirer quand
  une version de Next.js les embarque.
- **Dependabot** (`.github/dependabot.yml`) : npm et GitHub Actions, chaque lundi, versions
  exactes conservées, **aucune fusion automatique**. Son outil de mise à jour tourne sous
  Node 24 : `engines.node` accepte donc `>=22 <25`, la CI et le poste de développement restant
  en Node 22.
- **gitleaks** (job _Secret scan_ de la CI) sur tout l'historique, résultats masqués ;
  exceptions limitées aux secrets fictifs de test (`.gitleaks.toml`) et aux faux positifs
  vérifiés un par un (`.gitleaksignore`, par empreinte : l'alphabet des mots de passe
  provisoires).
- **`.gitignore`** ignore tout `.env*` sauf `.env.example` ; `tests/repo/secrets-hygiene.test.ts`
  le vérifie, ainsi qu'aucun fichier `.env` suivi et aucune vraie clé dans l'exemple.

## Journalisation (`src/server/log.ts`)

Une ligne JSON par événement (`level`, `event`, données, `at`). Avant écriture :

- clés de secrets (`password`, `token`, `cookie`, `authorization`, `secret`, `apiKey`,
  `serviceRole`, `signature`, `session`…) → `[masqué]`, à toute profondeur ;
- e-mails, où qu'ils soient → `email:<empreinte>` (même empreinte que l'audit) ;
- jetons JWT, clés Supabase, `Bearer …` → masqués ; paramètres des URL signées retirés ;
- erreurs → nom, code et message masqué (pile hors production), jamais le détail SQL ni les
  paramètres d'une requête.

Tests : `tests/server/log.test.ts`.

## Pages d'erreur

`not-found`, `error` et `global-error` (`src/app/`) affichent le galet `worried`, un message en
français et, pour les erreurs, seulement la référence (`digest`) : le détail reste dans les
journaux du serveur (`tests/app/error-pages.test.tsx`).
