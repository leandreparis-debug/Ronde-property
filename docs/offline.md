# Hors réseau et synchronisation (étape 12)

Ce document décrit le fonctionnement hors réseau de RONDE : la copie locale, la file d'envoi,
la synchronisation, les conflits et le service worker. Les choix et leurs raisons sont dans
`docs/adr/0001-hors-reseau.md` ; le service worker et l'installation dans `docs/pwa.md` ; ce
que la copie locale implique pour la sécurité dans `docs/security.md`.

## En une phrase

**Tout l'écran d'une visite lit la copie locale (IndexedDB) et toute écriture passe par la
file d'envoi** : en ligne comme hors ligne, c'est le même chemin. Le réseau ne sert qu'à
envoyer la file (`POST /api/sync`) et à rafraîchir la copie (`GET /api/sync/visits/[id]`).

```
écran ──► useVisitMutations ──► engine.enqueue ──► IndexedDB (outbox + application locale)
  ▲                                                     │
  └──────── useLiveQuery (copie locale) ◄───────────────┤
                                                        ▼
                         SyncEngine.flush ──► POST /api/sync (≤ 50 opérations)
                                                        │  applied / conflict / rejected / retry
                                                        ▼
                                    applySyncResult (une transaction IndexedDB)
```

## Ce qui marche sans réseau

| Fonction                                                                                        | Sans réseau                                         |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Ouvrir une visite gardée (même après rechargement ou redémarrage)                               | oui (enveloppe du service worker + copie locale)    |
| Informations, participants, notes, zones                                                        | oui                                                 |
| Photos (prise, légende, catégorie, zone, couverture, ordre, suppression)                        | oui (images gardées dans IndexedDB jusqu'à l'envoi) |
| Repères sur un plan déjà importé                                                                | oui (numéro « • » jusqu'à l'envoi)                  |
| Réserves (création, modification, statut, placement, suppression)                               | oui (code « R-? » jusqu'à l'envoi)                  |
| « Mes visites »                                                                                 | liste des visites gardées sur l'appareil            |
| Créer une visite, importer un plan, générer le rapport, terminer, rouvrir, dupliquer, supprimer | non : bouton désactivé, raison affichée             |

Le rapport demande en plus une file vide pour la visite (il doit refléter le serveur) ; terminer
la visite est refusé tant que des modifications ou des conflits l'attendent.

## Copie locale (`src/lib/offline/db.ts`)

Une base Dexie **par utilisateur**, `ronde-<userId>` : deux comptes sur la même tablette ne
voient jamais la copie de l'autre. Le dernier utilisateur connecté est noté dans
`localStorage` (`ronde.offline.user` : identifiant, nom, rôle ; aucun jeton) pour que
l'enveloppe hors ligne sache quelle base ouvrir.

| Table                                                                                     | Clé          | Contenu                                                                    |
| ----------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------- |
| `visits`                                                                                  | `id`         | visite (vue sérialisée), `kept`, `snapshotAt`, rédacteurs possibles        |
| `participants`, `notes`, `photos`, `plans`, `planPages`, `markers`, `reserves`, `reports` | `id` / `key` | lignes de la visite (`number: null` tant que le serveur n'a pas numéroté)  |
| `blobs`                                                                                   | `key`        | images des photos (principale, miniature) et pages de plans                |
| `outbox`                                                                                  | `opId`       | opérations en attente, ordonnées par `seq`                                 |
| `conflicts`                                                                               | `id`         | conflits à arbitrer : ma version, la version du serveur                    |
| `meta`                                                                                    | `key`        | dernière synchro, dernier contact serveur, `appliedAt:<visitId>`, réglages |

Le schéma est versionné (`LOCAL_SCHEMA_VERSIONS`) : une nouvelle version ajoute une entrée et,
si besoin, une fonction `upgrade` ; Dexie migre la base à l'ouverture, sans perdre la file.

### Garder une visite

- « Garder hors réseau » (menu de la visite) télécharge la visite (`GET /api/sync/visits/[id]`),
  ses photos et les pages de ses plans, après avoir affiché la taille estimée ; « Ne plus garder »
  l'efface (refusé tant que des modifications de la visite attendent).
- Sur tablette (écran tactile), une visite ouverte est gardée automatiquement ; l'option se
  coupe dans le menu du compte (« Garder hors réseau les visites ouvertes sur la tablette »).
- Seules les visites **en cours** que l'utilisateur peut modifier sont gardées.
- `navigator.storage.persist()` est demandé ; l'espace utilisé est affiché dans le menu du
  compte. Au-delà de 80 % du quota, une photo prise hors réseau demande une confirmation.

### Rafraîchissement sans écraser la file (`merge.ts`)

`mergeSnapshot` remplace la copie par la version du serveur **sauf** les entités citées par une
opération de la file (en attente, refusée ou bloquée) : elles gardent leur état local. Une copie
lue **avant** la dernière réponse appliquée (`fetchedAt < appliedAt:<visitId>`) est ignorée :
elle ramènerait un état plus ancien. `fetchedAt` est pris côté serveur **avant** la première
lecture, `serverTime` **après** les écritures, et la comparaison se fait dans la transaction de
fusion.

## File d'envoi (`outbox.ts`)

- Chaque opération a un `opId` **UUID v7** créé sur l'appareil, un `kind` (catalogue
  `src/lib/offline/ops.ts`, schémas zod partagés avec le serveur), un `payload`, la version
  connue (`baseVersion`) et sa portée (`visit:<id>`, `note:<id>`, `reserve:<id>`).
- Les entités créées hors ligne ont aussi un UUID v7 choisi par l'appareil, accepté par le
  serveur comme clé primaire : une réserve et son repère peuvent être liés avant l'envoi.
- **Regroupement** : trente frappes dans une note donnent une seule opération (la dernière
  remplace la précédente tant qu'elle n'est pas partie) ; une modification d'une entité créée
  hors ligne est fondue dans sa création ; créer puis supprimer avant l'envoi annule les deux.
- **Ordre et dépendances** : l'envoi suit `seq` ; une opération dépend de la création de ce
  qu'elle cite (`dependsOn`) ; si cette création est refusée, ses dépendantes sont bloquées.
- **Versions en chaîne** : quand une opération d'une portée est appliquée, la nouvelle version
  est reportée sur les opérations suivantes de la même portée (pas de faux conflit entre ses
  propres modifications).
- **Application locale** immédiate (`local-apply.ts`) : l'écran montre le résultat tout de suite,
  avec « R-? » pour une réserve et « • » pour un repère tant que le serveur n'a pas numéroté.

## Synchronisation (`engine.ts`)

`createSyncEngine` expose `enqueue`, `enqueuePhoto`, `flush`, `onStatus`, `pause`, `resume`,
`retry`, `remove`, `resolveConflict`. États : `idle`, `offline`, `syncing`, `error`,
`conflict`, `auth`, avec le nombre d'opérations en attente.

- **Déclencheurs** : retour du réseau (`online`), retour sur l'application
  (`visibilitychange`), toutes les 30 s tant que la file n'est pas vide, « Synchroniser
  maintenant ». Pas de Background Sync (absent de Safari).
- **Lots** de 50 opérations au plus, une visite à la fois, dans l'ordre.
- **Reprise** : après un échec réseau, nouvelle tentative après 1 s, puis à intervalle doublé,
  jusqu'à 5 min. Une opération restée « envoi en cours » (page fermée pendant l'envoi) repart au
  démarrage : renvoyer est sans risque (idempotence).
- **Photos** : `photo.create` (ligne `pending` et URL signée), envoi direct au stockage
  (`PUT` signé, progression), `photo.confirm`. Les images restent dans IndexedDB jusqu'à la
  confirmation, puis sont effacées si la visite n'est pas gardée.
- **Résultats** : `applied` (la copie prend la version du serveur), `conflict` (la version du
  serveur est gardée, la mienne va dans « À arbitrer »), `rejected` (droit retiré, visite
  terminée ou supprimée, donnée invalide : l'opération reste visible avec son texte et
  « Copier le texte »), `retry` (le serveur n'a pas pu : nouvelle tentative plus tard).
- **Session** : un `401` avec la raison `signed_out` met la file en pause (« Se reconnecter »,
  rien n'est perdu) ; `revoked` ou `inactive` efface la copie et renvoie à la connexion.

## Serveur

| Élément                                           | Rôle                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `POST /api/sync`                                  | applique un lot : `requireUser`, rôle `rt` ou `admin`, schéma zod, ≤ 50 opérations                       |
| `GET /api/sync/visits/[id]`                       | copie d'une visite (même lecture que la page, URL signées après lecture sous RLS)                        |
| `src/server/sync/apply.ts`                        | une opération = une transaction `withUser`, avec les **mêmes** services et dépôts que les écrans         |
| `src/server/sync/idempotency.ts`                  | `sync_operations (user_id, op_id, result)` : un `opId` déjà appliqué renvoie le même résultat            |
| `src/server/sync/snapshot.ts`                     | copie d'une visite (`fetchedAt` pris avant la lecture)                                                   |
| migration 21 `20261109100000_sync_operations.sql` | table `sync_operations` (service seulement) et `private.purge_sync_operations` (30 jours, purge de nuit) |

La numérotation reste au serveur (réserves par site, repères par plan) : deux tablettes
hors ligne ne peuvent pas produire deux « R-12 ».

## Conflits

Rien n'est jamais écrasé en silence. La version du serveur reste en place ; la mienne est mise
de côté dans `conflicts` et les opérations suivantes de la même portée attendent.

- **Note** : les deux textes côte à côte, « Garder la mienne », « Garder celle du serveur »,
  « Fusionner » (champ prérempli avec les deux textes, enregistré sur la version du serveur).
- **Réserve, informations de la visite** : tableau champ par champ, choix par champ.
- Le panneau de synchronisation liste les conflits (« À arbitrer ») et les refus ; l'indicateur
  passe à « inquiet » tant qu'il en reste.

## Interface

- **Indicateur** (barre du haut sur tablette, barre latérale sur PC) : le Galet endormi (hors
  réseau, avec le nombre en attente), attentif (envoi), souriant (tout est à jour), inquiet
  (conflit, refus, erreur), et l'heure de la dernière synchronisation.
- **Panneau** : état, « Synchroniser maintenant », opérations en attente en phrases simples,
  « À arbitrer », refus avec « Copier le texte ».
- **Points d'attente** : une pastille sur ce qui n'est pas encore envoyé (zone, photo, réserve,
  repère).
- **Badge** « Disponible hors réseau » sur les visites gardées.
- Bandeau « Hors réseau. Vos saisies sont gardées sur cet appareil… » puis « Connexion
  rétablie ».

## Brancher une nouvelle entité

Exemple : une table `visit_checklist_items` modifiable sur le terrain.

1. **Serveur d'abord** : dépôt et service habituels (RLS, `withUser`, version si concurrence
   optimiste). Le dépôt accepte un identifiant fourni par le client à la création
   (`id ?? randomUUID()`), comme `photos`, `reserves`, `plan_markers`, `visit_participants`.
2. **Catalogue** (`src/lib/offline/ops.ts`) : ajouter les `kind` (`checklist.create`,
   `checklist.update`, …) à `syncPayloadSchemas`, en réutilisant les schémas zod des
   formulaires ; ajouter le `kind` à `VERSIONED_KINDS` s'il porte une version.
3. **Application serveur** (`src/server/sync/apply.ts`) : un `case` par `kind`, qui appelle le
   service existant et renvoie dans `data` ce que la copie doit connaître (version, numéro…).
   Traduire les erreurs : `ConflictError` → `conflict` avec l'état actuel, `Forbidden` /
   `NotFound` / `Validation` → `rejected`. Une création rejouée avec le même identifiant doit
   renvoyer l'existant.
4. **Copie** : ajouter la liste à `VisitSnapshot` (`src/lib/offline/snapshot.ts` et
   `src/server/sync/snapshot.ts`), une table au schéma Dexie (**nouvelle version** de
   `LOCAL_SCHEMA_VERSIONS`), sa fusion dans `mergeSnapshot` (en gardant les entités citées par
   la file) et sa suppression dans `removeVisitLocally`.
5. **Application locale** (`local-apply.ts`) et **résultats** (`results.ts`) : ce que l'écran
   montre avant l'envoi, puis ce que la réponse change (numéro, version).
6. **Libellé** (`labels.ts`) : la phrase du panneau (« Case de la liste : … »).
7. **Écran** : lire via `useVisitData` / `useVisit`, écrire via une fonction de
   `useVisitMutations` ; afficher `PendingDot` tant que l'entité est dans `pendingIds`.
8. **Règles de la file** si besoin (`outbox.ts`) : regroupement, création + suppression,
   dépendances (`CREATING_KINDS`, `DELETING_KINDS`).
9. **Tests** : unitaires (`tests/lib/offline/`, fake-indexeddb), intégration
   (`tests/integration/sync.test.ts` : application, rejeu, droit, conflit), e2e hors réseau
   (`e2e/offline.spec.ts`).

## Tests

| Fichier                                 | Ce qui est vérifié                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/lib/offline/*.test.ts`           | file (regroupement, annulation, dépendances, versions), moteur (lots, reprise, conflits, refus, photos), fusion                                               |
| `tests/integration/sync.test.ts`        | idempotence, conflit, versions en chaîne, droits, visite terminée, identifiants client, deux appareils, photos                                                |
| `supabase/tests/migration21.test.ts`    | `sync_operations` réservée au service, purge                                                                                                                  |
| `e2e/offline.spec.ts`                   | rechargement hors réseau, indicateur (4 états), « Fusionner », visite terminée entre-temps, « Garder hors réseau », effacement après révocation, deux comptes |
| `e2e/acceptance/c7-hors-reseau.spec.ts` | critère C7 du cahier des charges                                                                                                                              |

Dans les tests Playwright, `context.setOffline(true)` coupe aussi le service worker ;
`page.route` ne voit pas les requêtes que le service worker sert depuis son cache (utiliser un
contexte `serviceWorkers: "block"` pour ralentir une ressource statique).
