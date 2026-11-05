# Application installable (PWA)

RONDE s'installe sur l'écran d'accueil d'une tablette (iPad, Android) ou d'un ordinateur et
s'ouvre alors sans barre de navigateur. **Aucun service worker** à l'étape 11 : rien n'est mis
en cache par l'application, chaque page vient du serveur.

## Éléments

| Élément                                    | Rôle                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `src/app/manifest.ts`                      | `/manifest.webmanifest` : RONDE, `standalone`, `orientation: any`, `lang: fr`, `start_url: /` |
| `src/lib/brand-colors.ts`                  | couleurs du manifeste et de `theme-color`, égales aux tokens de `globals.css` (test unitaire) |
| `scripts/brand/generate-icons.mjs`         | génère toutes les icônes et les écrans de démarrage à partir du galet et des tokens           |
| `public/icons/`                            | 192, 512 (`any`) et 512 `maskable` (galet dans la zone sûre de 80 %)                          |
| `src/app/apple-icon.png`, `favicon.ico`    | 180 px pour iOS, favicon 16/32/48 px ; liés automatiquement par Next.js                       |
| `public/splash/`, `src/lib/pwa.ts`         | écrans de démarrage iOS des iPad (portrait et paysage), `appleWebApp` dans `layout.tsx`       |
| `src/components/layout/offline-banner.tsx` | bandeau « Hors connexion » puis « Connexion rétablie »                                        |
| `src/app/hors-ligne/page.tsx`              | page publique et statique qui explique le comportement hors réseau                            |

Après un changement du galet ou d'un token :

```bash
node scripts/brand/generate-icons.mjs
```

## Installer

- **iPad (Safari)** : Partager → « Sur l'écran d'accueil ».
- **Android (Chrome)** : menu ⋮ → « Installer l'application » (ou « Ajouter à l'écran
  d'accueil »).
- **PC (Chrome, Edge)** : icône d'installation dans la barre d'adresse.

Chrome n'exige plus de service worker pour proposer l'installation : le test
`e2e/pwa.spec.ts` vérifie que Chromium ne signale **aucune erreur d'installabilité**
(`Page.getInstallabilityErrors`) ni d'erreur de manifeste (`Page.getAppManifest`). Si un
navigateur Android exigeait un jour un service worker, le point de départ serait un
`public/sw.js` minimal **sans cache** (gestionnaire `fetch` qui laisse passer la requête),
enregistré depuis le layout : c'est le premier pas de l'étape 12.

## Hors connexion (phase 1)

Ce que dit le bandeau suit le comportement réel des files, qui vivent **en mémoire** :

| Saisie                              | Pendant une coupure                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| Notes                               | nouvelle tentative après 1 s, 2 s, 5 s, 10 s, puis toutes les 30 s, sans limite     |
| Photos                              | trois nouvelles tentatives (1 s, 3 s, 10 s), puis « Réessayer »                     |
| Informations de la visite, réserves | message « Hors connexion : votre saisie est conservée » (`reachServer`), à renvoyer |
| Autres actions                      | à refaire au retour du réseau                                                       |

Fermer l'onglet perd ce qui attend : le navigateur prévient (`beforeunload`) tant qu'une note
ou une photo n'est pas enregistrée. `/hors-ligne` est publique (pas de session, aucune donnée) :
c'est la page qu'un service worker servira hors connexion à l'étape 12.

## Étape 12 (hors connexion complet)

File persistante (IndexedDB) derrière les interfaces actuelles (`createNoteSaver`,
`createUploadQueue`), service worker qui sert `/hors-ligne` et les ressources statiques, puis
synchronisation au retour du réseau.
