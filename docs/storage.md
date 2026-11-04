# Stockage des fichiers : `StorageService`

Les photos (étape 7), les plans (étape 8) et les rapports PDF (étape 10) vivent dans trois
buckets **privés** créés par la migration 7 : `visit-photos` (15 Mo, JPEG/PNG/WebP),
`site-plans` (50 Mo, PDF/PNG/JPEG) et `reports` (50 Mo, PDF). Les chemins sont relatifs au
bucket et commencent par l'identifiant de la visite ou du site : `{visit_id}/{photo_id}.jpg`
et `{visit_id}/{photo_id}_thumb.jpg` pour les photos ; `{site_id}/{plan_id}/original.{pdf|png|jpg}`,
`{site_id}/{plan_id}/p{n}.{png|jpg}` et `{site_id}/{plan_id}/p{n}_thumb.jpg` pour les plans
(étape 8). Les politiques du bucket `site-plans` ne lisent que le premier segment
(`private.storage_root_id`) : ces sous-dossiers, qui commencent par le `site_id`, sont acceptés
sans nouvelle migration.

Aucun fichier ne transite par une action serveur ni par une route Next.js (limite Vercel de
4,5 Mo par requête) : le navigateur envoie directement au stockage par **URL signée**, et lit
par URL signée.

## Interface (`src/server/storage/types.ts`)

```ts
interface StorageService {
  createSignedUpload(bucket, path, { contentType, maxBytes, expiresInSeconds? }): Promise<{ url; headers; expiresAt }>;
  createSignedRead(bucket, path, expiresInSeconds): Promise<string>;
  createSignedReads(bucket, paths, expiresInSeconds): Promise<Record<string, string>>;
  stat(bucket, path): Promise<{ size; contentType } | null>;
  remove(bucket, paths): Promise<void>;
}
```

`getStorageService()` (`src/server/storage/index.ts`, `server-only`) renvoie l'implémentation
choisie par `STORAGE_PROVIDER`. Tout chemin passe par `assertSafeObjectPath` : segments de
lettres, chiffres, `.`, `_`, `-`, séparés par `/`, sans `.`/`..`, sans caractère nul ni
antislash, 512 caractères au plus.

## Deux implémentations

|                | `supabase` (production, par défaut)                                                                                                                       | `local` (tests et développement)                                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichiers       | Supabase Storage, clé `service_role` (`createAdminSupabaseClient`).                                                                                       | Système de fichiers sous `LOCAL_STORAGE_DIR` (`.storage/` par défaut, ignoré par git) : `{dir}/{bucket}/{path}` et un fichier `{path}.meta.json` (type, taille). Écriture atomique (fichier temporaire puis `rename`). |
| URL d'envoi    | `createSignedUploadUrl` (jeton valable 2 h, durée fixée par l'API ; `expiresAt` lu dans le jeton). `PUT` du navigateur avec `Content-Type` et `x-upsert`. | URL relative `/api/local-storage/{bucket}/{path}?exp&max&ct&sig`, signée **HMAC-SHA256** (`LOCAL_STORAGE_SECRET`) sur la méthode, le bucket, le chemin, l'expiration, la taille maximale et le type. 2 minutes.        |
| URL de lecture | `createSignedUrl` / `createSignedUrls`.                                                                                                                   | Même route, `GET`, signature sur la méthode, le bucket, le chemin et l'expiration.                                                                                                                                     |
| `stat`         | `info(path)` (taille, type) ; 404 → `null`.                                                                                                               | `fs.stat` + sidecar.                                                                                                                                                                                                   |
| Activation     | `STORAGE_PROVIDER=supabase` (défaut) + `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.                                                          | `STORAGE_PROVIDER=local` **et** `ALLOW_LOCAL_STORAGE=true` **et** `LOCAL_STORAGE_SECRET` (32 caractères min.).                                                                                                         |

Garde-fous de `local`, identiques à ceux de `AUTH_PROVIDER=local` et vérifiés au démarrage par
`src/lib/env.ts` : refusé si `VERCEL` est défini ou si `DATABASE_URL` n'est pas sur
`localhost` / `127.0.0.1`. La route `src/app/api/local-storage/[...path]/route.ts` répond
**404 à toute requête** dès que le fournisseur n'est pas `local`.

Refus de la route locale : 400 (URL incomplète, chemin invalide, corps vide), 403 (signature
invalide), 410 (URL expirée : le navigateur redemande une URL), 413 (taille au-dessus de la
limite signée, vérifiée sur `Content-Length` puis en lisant le flux), 415 (`Content-Type`
différent de celui signé), 405 (autre méthode). `GET` renvoie
`Cache-Control: private, max-age=600`.

## Pourquoi l'autorisation passe par la base avant toute URL signée

Les deux implémentations contournent les règles d'accès du stockage : la clé `service_role`
ignore les politiques `storage.objects`, et le fournisseur local n'en a pas. La règle est donc :

> **Aucune URL signée sans vérification de droit via `withUser`.**

- URL d'**envoi** : délivrée seulement après l'insertion d'une ligne `photos` en `pending`
  **sous RLS** (`withUser`). Si la RLS accepte l'insertion, l'utilisateur peut modifier la
  visite. La ligne porte le chemin exact qui sera signé.
- URL de **lecture** : délivrée seulement pour des lignes que l'utilisateur **lit sous RLS**
  (la liste des photos d'une visite est une requête `withUser`).
- La **confirmation** (`stat` des deux objets, taille et type) repasse par `withUser` pour
  passer la ligne en `ready`.

Les politiques `storage.objects` de la migration 7 restent en place comme seconde ligne de
défense si un client Supabase utilisateur était un jour utilisé.

## Durées

| URL             | Durée                                                       |
| --------------- | ----------------------------------------------------------- |
| Envoi (`PUT`)   | 2 minutes (`local`) ; 2 heures, fixées par l'API Supabase.  |
| Lecture (`GET`) | 10 minutes ; renouvelée par l'interface sur erreur d'image. |

## Suite de contrat

`tests/server/storage/contract.test.ts` exécute le même scénario sur chaque implémentation :
`stat` absent → `createSignedUpload` + `PUT` → `stat` présent → `createSignedRead` + `GET` →
`createSignedReads` (objet manquant exclu) → `remove` (objet manquant ignoré) → chemin
dangereux refusé.

- `local` : toujours, dans un dossier temporaire, la route étant appelée en mémoire.
- `supabase` : seulement si `SUPABASE_TEST_URL` et `SUPABASE_TEST_SERVICE_ROLE_KEY` sont
  définies (projet de **test** dédié, jamais le projet de production). Sinon la suite est
  ignorée avec un message. Lancement :

```bash
SUPABASE_TEST_URL=https://xxxx.supabase.co SUPABASE_TEST_SERVICE_ROLE_KEY=... pnpm test tests/server/storage/contract.test.ts
```

Les autres tests : `tests/server/storage/local-signing.test.ts` (signature, falsification,
expiration), `local-route.test.ts` (refus de la route), `object-path.test.ts`,
`route-guard.test.ts` (404 hors `local`) et `tests/lib/env.test.ts` (validation croisée).
