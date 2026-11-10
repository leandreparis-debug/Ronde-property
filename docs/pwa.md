# Application installable (PWA)

RONDE s'installe sur l'écran d'accueil d'une tablette (iPad, Android) ou d'un ordinateur et
s'ouvre alors sans barre de navigateur. Depuis l'étape 12, un **service worker** (`public/sw.js`)
garde l'enveloppe de l'application et ses fichiers statiques : une visite gardée sur
l'appareil s'ouvre sans réseau, même après un rechargement. Les données, elles, vivent dans
IndexedDB (`docs/offline.md`).

## Éléments

| Élément                                     | Rôle                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/app/manifest.ts`                       | `/manifest.webmanifest` : RONDE, `standalone`, `orientation: any`, `lang: fr`, `start_url: /` |
| `src/lib/brand-colors.ts`                   | couleurs du manifeste et de `theme-color`, égales aux tokens de `globals.css` (test unitaire) |
| `scripts/brand/generate-icons.mjs`          | génère toutes les icônes et les écrans de démarrage à partir du galet et des tokens           |
| `public/icons/`                             | 192, 512 (`any`) et 512 `maskable` (galet dans la zone sûre de 80 %)                          |
| `src/app/apple-icon.png`, `favicon.ico`     | 180 px pour iOS, favicon 16/32/48 px ; liés automatiquement par Next.js                       |
| `public/splash/`, `src/lib/pwa.ts`          | écrans de démarrage iOS des iPad (portrait et paysage), `appleWebApp` dans `layout.tsx`       |
| `src/components/layout/offline-banner.tsx`  | bandeau « Hors réseau » puis « Connexion rétablie »                                           |
| `src/app/hors-ligne/page.tsx`               | page publique et statique qui explique le comportement hors réseau                            |
| `public/sw.js`                              | service worker écrit à la main (ADR 0001), versionné par le build                             |
| `src/components/offline/service-worker.tsx` | enregistrement (build de production) et invitation « Nouvelle version disponible »            |
| `src/app/hors-ligne/visite/page.tsx`        | enveloppe hors ligne : rend `/`, une visite ou une réserve depuis la copie locale             |

Après un changement du galet ou d'un token :

```bash
node scripts/brand/generate-icons.mjs
```

## Installer

- **iPad (Safari)** : Partager → « Sur l'écran d'accueil ».
- **Android (Chrome)** : menu ⋮ → « Installer l'application » (ou « Ajouter à l'écran
  d'accueil »).
- **PC (Chrome, Edge)** : icône d'installation dans la barre d'adresse.

Le test `e2e/pwa.spec.ts` vérifie que Chromium ne signale **aucune erreur d'installabilité**
(`Page.getInstallabilityErrors`) ni d'erreur de manifeste (`Page.getAppManifest`).

## Service worker (`public/sw.js`)

Écrit à la main plutôt qu'avec Serwist (ADR 0001) : moins de 250 lignes, des règles lisibles,
aucune dépendance de build, et la garantie qu'aucune réponse de l'API n'entre jamais dans un
cache.

**Version.** Le worker est enregistré à l'adresse `/sw.js?v=<NEXT_PUBLIC_BUILD_ID>` (12
premiers caractères du commit sur Vercel). Chaque déploiement installe donc un nouveau worker,
avec ses propres caches `ronde-shell-<v>` et `ronde-static-<v>` ; les caches des versions
précédentes sont supprimés à l'activation. `/sw.js` est servi avec `Cache-Control: no-cache`
(`next.config.ts`). Enregistrement en build de production seulement (`pnpm dev` n'en a pas).

**Installation.** Précharge l'enveloppe `/hors-ligne/visite`, la page `/hors-ligne`, le
manifeste et les icônes, puis chaque script, feuille de style et police que ces deux pages
référencent (au plus 4 téléchargements à la fois, 20 s chacun ; une réponse non gardée est
toujours libérée, sinon les connexions du navigateur restent occupées).

### Règles de cache

| Requête                                                                     | Traitement                                                                                                                                                     |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| autre que `GET`, autre origine (Supabase : URL signées, authentification)   | **jamais interceptée**                                                                                                                                         |
| `/api/*` (synchronisation, URL signées locales, cron)                       | **jamais interceptée**, jamais en cache                                                                                                                        |
| navigation (page)                                                           | réseau d'abord (préchargement de navigation) ; sans réseau : l'enveloppe pour `/`, `/visites/<id>`, `/visites/<id>/reserves/<id>`, `/hors-ligne` pour le reste |
| `/_next/static/*`, `/icons/*`, `/splash/*`, `/fonts/*`, manifeste, favicons | cache d'abord (fichiers à empreinte, immuables), mis en cache à la première lecture                                                                            |
| tout le reste (données RSC des pages, …)                                    | réseau, sans cache                                                                                                                                             |

Aucune page avec des données n'est mise en cache : l'enveloppe est une page **sans données**,
qui lit l'utilisateur de l'appareil (`localStorage`) et sa base IndexedDB. Une visite non
gardée sur l'appareil y affiche « Cette visite n'est pas disponible hors réseau ».

### Mise à jour

Un nouveau déploiement installe son worker en arrière-plan ; il **attend** (`waiting`). Le
bandeau « Nouvelle version disponible » propose « Mettre à jour » : le clic envoie
`SKIP_WAITING`, le nouveau worker prend la main et la page se recharge. Il n'y a **jamais de
rechargement forcé** : tant que la file d'envoi n'est pas vide, le bandeau le dit et la mise à
jour attend que tout soit synchronisé (une saisie en cours n'est jamais interrompue). Le
premier worker d'un appareil, lui, s'active tout de suite (rien à remplacer).

### Vérifier sur un appareil

- Chrome / Edge : outils de développement → **Application → Service workers** (version,
  état), **Cache storage** (`ronde-shell-…`, `ronde-static-…`), **IndexedDB** (`ronde-<id>`).
- Safari (iPad) : réglages → Safari → Avancé → Inspecteur web, puis Safari sur un Mac.
- Pour repartir de zéro : « Unregister » et « Clear site data » (efface aussi la copie
  locale : synchroniser d'abord).
