# ADR 0001 — Travail hors réseau et synchronisation

- **Statut** : accepté (étape 12, 9 novembre 2026), écrit avant le code.
- **Décideurs** : Léandre (recommandations du prompt de l'étape 12), Claude Code (mise en
  œuvre). Les choix qui s'écartent de la recommandation sont signalés et argumentés.

## Contexte

Les entrepôts visités ont des zones sans couverture (cellules, chambres froides). Le cahier des
charges demande qu'un RT puisse **poursuivre une visite déjà commencée sans réseau** : saisir
les notes, prendre et légender des photos, placer des repères, créer et modifier des réserves,
voir ce qui attend d'être synchronisé, et que **tout parte seul au retour du réseau**, dans
l'ordre, sans doublon ni perte. La création d'une visite, l'import d'un plan, la génération du
rapport et la clôture de la visite peuvent exiger une connexion.

Ce qui existe déjà (phase 1) : la concurrence optimiste par `version` (`visits`,
`visit_zone_notes`, `reserves`), des files **en mémoire** pour les notes (réessais sans limite)
et les photos (trois réessais), le parcours d'envoi des photos (`pending` → URL signée → `PUT`
→ `confirm`), la numérotation côté base (réserves par site, repères par compteur), la
déconnexion de toutes les sessions, une application installable **sans** service worker.

Contraintes permanentes : pas d'accès à Supabase hors de `src/server/`, aucune URL signée sans
contrôle `withUser`, aucun fichier de plus de 4 Mo via le serveur, règles d'accès dans la base,
CSP à nonce sans `unsafe-inline`, textes en français, tactile d'abord, aucune donnée réelle.

## Décisions

### 1. Données locales : IndexedDB avec Dexie, une base par utilisateur

**Options étudiées.**

| Option                       | Pour                                                                           | Contre                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `localStorage` / JSON        | trivial                                                                        | ~5 Mo, synchrone, pas de `Blob` : impossible pour les photos et les pages de plan                  |
| IndexedDB nu                 | aucune dépendance                                                              | API verbeuse et piégeuse (transactions auto-fermées, versions), beaucoup de code à tester          |
| **Dexie 4** (version exacte) | API simple, migrations de schéma, `liveQuery` pour React, `Blob` natifs, 30 Ko | une dépendance de plus                                                                             |
| SQLite WASM + OPFS           | requêtes riches                                                                | ~1 Mo de WASM, support OPFS inégal sur iOS, CSP `wasm-unsafe-eval`, surdimensionné pour une visite |

**Choix.** Dexie 4 (`dexie`, `dexie-react-hooks`, versions exactes), une base **par
utilisateur** nommée `ronde-<id>`, schéma versionné par `db.version(n)` avec migrations locales.
Les tables : `visits`, `participants`, `notes`, `photos`, `photoBlobs`, `plans`, `planPages`,
`planPageBlobs`, `markers`, `reserves`, `profiles` (noms seulement), `reports`, `outbox`,
`conflicts`, `meta`.

**Raisons.** Une base par utilisateur isole la copie et la file : un autre compte connecté sur la
même tablette ouvre une autre base et ne voit rien du premier. Les blobs restent dans IndexedDB
(aucune URL signée n'est mise en cache). Aucun jeton n'y est écrit : la session reste dans le
cookie `httpOnly`.

### 2. Rendu local d'abord pour la visite, un seul chemin d'écriture

**Options.** (a) Garder les props du serveur et ajouter une « surcouche » hors ligne dans
chaque onglet ; (b) **rendre les onglets depuis le store local**, alimenté par l'instantané du
serveur, et faire passer **toutes** les écritures par la file, en ligne comme hors ligne.

**Choix.** (b). Les composants de la visite lisent le store (`useLiveQuery`), la page serveur
ne sert plus qu'à charger l'instantané et à l'injecter. Chaque écriture devient une opération
de la file ; en ligne, la file est vidée aussitôt et l'interface attend le résultat de
l'opération (pour afficher le numéro attribué, un conflit, un refus) ; hors ligne, elle
s'applique localement et attend le réseau.

**Raisons.** Un seul chemin, testé en permanence par les suites existantes (le mode en ligne
exerce exactement le code du mode hors ligne). La page d'enveloppe hors réseau est le même
composant client sans instantané. Le coût : une refonte des onglets, acceptée parce qu'elle
supprime les files parallèles de l'étape 6 et de l'étape 7.

Les changements d'onglet et de filtres (`?onglet=`, `?zone=`…) passent par
`history.replaceState` (que Next.js 15 synchronise avec `useSearchParams`) et non plus par
`router.replace` : aucune requête au serveur n'est nécessaire pour changer d'onglet, ce qui
rend l'enveloppe utilisable sans réseau et évite un rechargement complet par changement.

### 3. Service worker minimal écrit à la main, pas Serwist

**Options.** Serwist (`@serwist/next`), Workbox seul, ou un `sw.js` minimal.

**Choix.** Un service worker **minimal** (`src/service-worker/sw.js`, copié dans
`public/sw.js` au build avec l'empreinte de la version), enregistré en production seulement.
Il met en cache : l'enveloppe de l'application (`/hors-ligne`, `/hors-ligne/visite`), les
ressources `/_next/static/*` (empreintées, immuables), les icônes, le manifeste, les écrans de
démarrage, les polices et le worker pdf.js (servis sous `/_next/static/media`). Pour une
navigation vers `/visites/[id]` sans réseau, il sert la **page d'enveloppe** précachée, rendue
côté client depuis le store. Il ne met **jamais** en cache : `/api/*`, les actions serveur
(`POST`), les URL signées (Supabase ou `/api/local-storage`), ni aucune page de données.

**Raisons de l'écart avec la recommandation.** Serwist apporte une liste de précache générée au
build (très utile) mais : il s'insère dans la configuration webpack de Next.js 15.5 (version à
accorder exactement), il précache par défaut **tous** les morceaux de l'application (pdf.js,
react-pdf, administration : plusieurs Mo installés sur la tablette avant la première visite),
et ses stratégies génériques doivent être bridées une à une pour respecter la règle « aucune
réponse d'API ni URL signée en cache ». Un fichier de 200 lignes, lisible et testé de bout en
bout, donne le contrôle exact de ce qui est caché et quand ; le précache des morceaux est obtenu
en lisant les `<script>`/`<link>` de l'enveloppe au moment de la mise en cache (« réchauffage »
après chaque chargement en ligne), le reste étant caché à l'usage. Si la liste générée devenait
nécessaire (V2, serveur interne), Serwist reste la piste à reprendre : la décision est notée
dans `docs/decisions.md`.

### 4. Identifiants générés sur l'appareil (UUID v7) et opérations idempotentes

**Options.** Identifiants temporaires côté client puis table de correspondance après création
sur le serveur ; ou **UUID v7 générés sur l'appareil** acceptés tels quels par le serveur.

**Choix.** UUID v7 (`src/lib/offline/ids.ts`, horodaté donc trié par création) pour les notes
(zones), participants, photos, repères et réserves créés hors réseau. Les tables ont déjà
`id uuid primary key default gen_random_uuid()` : fournir l'identifiant à l'insertion suffit,
aucune politique RLS ne dépend de l'identifiant. Une création renvoyée deux fois se heurte à la
clé primaire : le serveur répond alors avec l'état existant (idempotence naturelle). Les
**mises à jour** sont rendues idempotentes par la table `sync_operations (user_id, op_id,
applied_at, result)` (migration 21) : une opération déjà appliquée renvoie son résultat
d'origine ; les entrées de plus de 30 jours sont purgées par la tâche nocturne existante.

**Raisons.** Pas de réécriture des références (photo → réserve, repère → réserve) après
synchronisation, et une coupure en plein envoi ne crée jamais de doublon.

### 5. Numéros attribués par le serveur, provisoires sur la tablette

Une réserve créée hors réseau s'affiche « R-? », un repère « • », jusqu'à ce que le résultat
`applied` apporte le numéro attribué par les triggers (par site pour les réserves, par compteur
`(visite, plan)` pour les repères). Deux tablettes ne peuvent donc jamais produire le même
numéro. Les numéros ne sont jamais réattribués (règles 29 et 30 de `CLAUDE.md`).

### 6. File de synchronisation : ordre, regroupement, dépendances, reprise

- **Persistée** dans `outbox` (IndexedDB), ordonnée par `seq` croissant et par visite ; champs :
  `opId`, `visitId`, `kind` (entité et opération), `entityId`, `payload`, `baseVersion`,
  `dependsOn`, `attempts`, `lastError`, `status`, `createdAt`, `updatedAt`.
- **Regroupement** quand c'est sûr : plusieurs mises à jour d'une même note, d'une même réserve,
  des informations de la visite, d'un même repère (déplacement, libellé) donnent une seule
  opération (dernier contenu, `baseVersion` d'origine) ; une mise à jour d'une entité **créée
  hors réseau et pas encore envoyée** est repliée dans la création ; une suppression d'une telle
  entité annule tout (rien n'est envoyé).
- **Dépendances** : une opération qui cite une entité créée par une opération en attente en
  dépend ; l'ordre des `seq` garantit la création d'abord, et un refus (`rejected`) d'une
  dépendance bloque ses dépendantes sans toucher aux autres entités.
- **Versions en chaîne** : quand une opération est appliquée avec une nouvelle `version`, les
  opérations suivantes du même périmètre de version (visite, note ou réserve) qui portaient la
  même `baseVersion` sont rebasées sur la version renvoyée. Trois notes et deux participants
  saisis hors réseau partent donc sans faux conflit.
- **Transport** : `POST /api/sync` avec des lots de 50 opérations au plus, une visite après
  l'autre ; chaque opération est appliquée via `withUser` dans sa propre transaction, par les
  **mêmes dépôts et services** que les actions serveur, avec les mêmes schémas `zod`. Résultat
  par opération : `applied` (version, numéro, état frais), `conflict` (état du serveur),
  `rejected` (droit, validation, visite terminée) ou `retry`.
- **Déclenchement** : `online`, retour au premier plan (`visibilitychange`), minuterie de 30 s
  quand des opérations attendent, bouton « Synchroniser maintenant ». Pas de Background Sync
  (iOS). **Reprise** progressive 1 s, 2 s, 4 s… plafonnée à 5 min.

**Option écartée.** Une action serveur par opération : pas de lot, pas de statut explicite
`retry`/`rejected`, et impossible à appeler proprement hors de React (le moteur tourne dans la
coquille de l'application, sur toutes les pages).

### 7. Conflits : la version du serveur reste en place, la saisie est mise à arbitrer

**Options.** Dernier écrit gagne ; fusion automatique (CRDT) ; **serveur conservé + arbitrage**.

**Choix.** Quand le serveur répond `conflict`, le store local reprend l'état du serveur et la
saisie locale est rangée dans `conflicts` (version locale, version du serveur, horodatage).
Le panneau **« À arbitrer »** propose, pour une note, les deux textes côte à côte puis « Garder
la mienne », « Garder celle du serveur » ou « Fusionner » (champ prérempli) ; pour une réserve
ou les informations, un tableau des champs qui diffèrent avec un choix par champ. L'arbitrage
produit une nouvelle opération avec la bonne `baseVersion`. En ligne, le dialogue de conflit de
l'étape 6 (« Garder ma version » / « Prendre la sienne ») et l'encadré de l'étape 9 restent
affichés immédiatement : ce sont deux entrées vers le même enregistrement de `conflicts`.

**Raisons.** Rien n'est perdu, rien n'est écrasé en silence (exigence du cahier des charges) ;
les CRDT sont disproportionnés pour des notes de visite et perdraient l'intention métier.

### 8. Photos hors réseau

Le fichier compressé (1600 px) et sa miniature (400 px) sont produits dans le navigateur
(worker existant) et gardés en `Blob` dans `photoBlobs` ; l'envoi reprend le parcours existant
(`pending` avec identifiant fourni, URL signée, `PUT`, `confirm`) au retour du réseau, après la
création de la ligne. Les blobs sont supprimés **après** `confirm`, sauf si la visite est gardée
hors réseau (ils deviennent alors la copie locale). Une coupure en plein `PUT` reprend sans
doublon : la ligne `pending` existe, `photo.create` renvoyé renvoie de nouvelles URL.

### 9. Copie locale, sécurité et effacement

- La copie locale ne contient que les visites **gardées hors réseau** (choix explicite, ou
  automatique pour une visite en cours et modifiable ouverte sur la tablette, option désactivable
  dans le menu du compte), avec leurs plans réduits aux pages utiles.
- Effacement complet de la base de l'utilisateur : à la déconnexion (après avertissement s'il
  reste des opérations), quand le serveur répond « sessions révoquées » ou « compte désactivé »,
  et après 14 jours sans contact avec le serveur.
- Jamais de jeton dans IndexedDB ; une session expirée hors réseau n'interrompt pas la saisie :
  au retour du réseau, « Reconnectez-vous » sans perdre la file (même utilisateur → même base).
- Risque restant documenté dans `docs/security.md` : les données de la copie locale sont
  lisibles sur une tablette déverrouillée.
- `navigator.storage.persist()` est demandé ; l'espace utilisé est affiché dans le menu du
  compte ; au-delà de 80 % du quota, alerte et confirmation avant une nouvelle photo hors réseau.

### 10. Ce qui reste en ligne

Créer une visite, importer un plan, générer le rapport et **terminer la visite** exigent le
serveur (la clôture verrouille la visite : elle est refusée tant que la file de la visite n'est
pas vide ou qu'un conflit reste ouvert). Hors réseau, ces actions sont désactivées avec leur
raison.

## Conséquences

- Nouvelle dépendance `dexie` (+ `dexie-react-hooks`, `fake-indexeddb` en test), versions exactes.
- Migration 21 (`sync_operations`, purge) à appliquer par Léandre (`docs/deploy.md`).
- `src/lib/offline/` devient la couche locale commune : les étapes 13 (cycle des réserves,
  photo de preuve) et 14 (reprise des réserves, trames) ajoutent des **opérations** à la file
  et des **tables** au schéma local sans refaire le moteur (`docs/offline.md`, « Brancher une
  nouvelle entité »).
- Les files en mémoire de l'étape 6 (`createNoteSaver`) et de l'étape 7 (`createUploadQueue`)
  sont remplacées par le moteur ; leurs tests unitaires disparaissent au profit de ceux du moteur,
  le comportement à l'écran est conservé (mêmes libellés, mêmes identifiants de test).
- Les tests e2e tournent sur un build de production avec le service worker actif ; les tests qui
  coupaient le réseau en visant les actions serveur visent désormais `/api/sync`.
