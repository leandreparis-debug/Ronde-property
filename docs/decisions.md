# Journal des décisions d'architecture

Une entrée par décision, datée. Les décisions ne sont pas réécrites : une nouvelle entrée
peut en remplacer une ancienne.

## 2026-11-02 — Hébergement V1 sur Vercel + Supabase, avec couche d'abstraction

**Contexte.** RONDE doit être disponible rapidement pour les RT ; le groupe prévoit à terme un
hébergement sur un serveur interne (V2) sur un réseau fermé.

**Décision.** La V1 est hébergée sur Vercel (Next.js) et Supabase (Postgres, Auth, Storage).
Tout accès aux données, aux fichiers et à l'authentification passe par des interfaces de
`src/server/` : repositories par agrégat, `StorageService`, `AuthService`. Les composants et les
pages n'importent jamais le client Supabase.

**Conséquences.** La migration V2 remplace les implémentations sans toucher aux écrans. Les
polices sont auto-hébergées dès la V1 (`next/font`) pour fonctionner hors CDN.

## 2026-11-02 — Rapport PDF généré dans le navigateur

**Décision.** Le rapport de visite (étape 10) sera généré côté client, dans le navigateur de
la tablette ou du PC, à partir des données de la visite.

**Motivation.** Pas de dépendance à un service de rendu serveur, compatibilité avec la V2 sur
réseau fermé, et possibilité de produire le rapport hors réseau plus tard.

## 2026-11-02 — Référentiel des sites importé de VIGIE en CSV

**Décision.** Le référentiel des sites (étape 4) est importé d'un export CSV de VIGIE, l'outil
entrepôts du groupe, par un admin. Aucune intégration en temps réel en V1.

**Motivation.** VIGIE n'expose pas d'API utilisable depuis Vercel ; l'import manuel garde la
maîtrise des données et évite toute donnée réelle dans le dépôt (seules des fixtures fictives y
figurent).

## 2026-11-02 — Comptes créés par un admin en attendant le SSO

**Décision.** Les comptes (étape 3) sont créés par un administrateur ; pas d'inscription
libre. Le SSO du groupe sera étudié pour la V2.

**Motivation.** Population d'utilisateurs connue et limitée (RT, Direction, Admin), contrôle des
rôles dès le premier jour.

## 2026-11-02 — Thème clair uniquement en V1

**Décision.** Un seul thème, clair. Les tokens sont déclarés dans `@theme` pour qu'un thème
sombre puisse être ajouté plus tard sans toucher aux composants.

**Motivation.** Usage sur site en journée et sur PC de bureau ; limiter la surface de test de
la V1.

## 2026-11-02 — Composants UI écrits à la main, façon shadcn

**Décision.** Les primitives de `src/components/ui/` sont écrites à la main sur les primitives
Radix (dialog, tabs, slot, toast), sans la CLI shadcn.

**Motivation.** La CLI n'est pas disponible dans l'environnement de développement ; le code
reste entièrement dans le dépôt, stylé avec les seuls tokens RONDE.

## 2026-11-02 — Tests de bout en bout sur un build de production

**Décision.** `pnpm test:e2e` lance `next build && next start` avant Playwright (Chromium
seulement), en local comme dans la CI.

**Motivation.** Tester exactement ce qui sera déployé (en-têtes de sécurité, polices
auto-hébergées, CSS compilé) et éviter les faux positifs du mode développement.

## 2026-11-02 — Ajustement minimal de deux couleurs pour le contraste WCAG AA

**Contexte.** La charte fixe `brand` à `#2F6BFF` et `status-open` à `#D63A22`. Mesurés par axe,
le blanc sur `#2F6BFF` donne 4,49:1 et `#D63A22` sur `#FDE4DE` donne 3,86:1, sous le seuil AA
de 4,5:1 pour le texte de 14 px. Les tests exigent zéro violation `serious`.

**Décision.** `brand` devient `#2F6AFF` (4,54:1, écart d'une unité de vert, invisible) et le
texte `status-open` devient `#C0341F` (4,6:1). Le rouge `#D63A22` d'origine est conservé pour le
point de la pastille (`--color-status-open-dot`), sur le modèle de `#E8A400` pour « En cours ».

**Conséquences.** Les autres tokens sont inchangés. Toute future couleur de texte doit être
vérifiée à 4,5:1 sur ses fonds possibles avant d'entrer dans `@theme`.

## 2026-11-02 — Polices : `next/font/google` en V1, `next/font/local` à l'étape 11

**Décision.** En V1, les trois polices sont chargées avec `next/font/google` : elles sont
téléchargées une fois au `build` sur Vercel, puis servies par l'application sans aucun appel
à un CDN à l'exécution. Le passage à `next/font/local`, avec les fichiers de polices embarqués
dans le dépôt, est prévu à l'étape 11 pour la V2 sur réseau fermé, dont la machine de build
n'aura pas d'accès sortant.

## 2026-11-02 — Base de test : PostgreSQL nu + bootstrap, plutôt que Supabase CLI

**Décision.** Les tests de la base tournent sur un PostgreSQL 16 local (et un service
PostgreSQL en CI) avec `supabase/tests/bootstrap.sql`, qui émule les rôles `anon`,
`authenticated`, `service_role`, le schéma `auth` (`auth.users`, `auth.uid()`, `auth.jwt()`) et
le schéma `storage` (`buckets`, `objects`, `foldername()`).

**Motivation.** Docker n'est pas disponible dans l'environnement de développement ni sur le
PC de Léandre ; les migrations restent 100 % compatibles avec la plateforme (elles ne
dépendent d'aucun objet du bootstrap qui n'existe pas sur Supabase). Le bootstrap n'est jamais
appliqué à un vrai projet.

## 2026-11-02 — Plans rattachés au site

**Décision.** `site_plans` référence le site, pas la visite : un plan AutoCAD est réutilisé de
visite en visite et servira à la comparaison avant / après (phase 3). Les repères
(`plan_markers`) restent rattachés à la visite.

## 2026-11-02 — Numérotation des réserves par site

**Décision.** Le numéro d'une réserve (« R-07 ») est séquentiel **par site**, attribué par
trigger sous verrou consultatif (`pg_advisory_xact_lock`) pour exclure les doublons en cas de
création concurrente. Il est immuable et unique par `(site_id, number)`.

**Motivation.** Les RT et les prestataires parlent d'une réserve par son numéro sur le site ;
une numérotation par visite créerait des collisions d'une visite à l'autre.

## 2026-11-02 — Suppression logique des visites et des réserves

**Décision.** Aucune suppression physique par les utilisateurs : `deleted_at` / `deleted_by`,
positionnés par les RPC `soft_delete_visit` et `soft_delete_reserve`, tracés dans `audit_log`.
Les lignes supprimées restent visibles par l'admin.

## 2026-11-02 — `visits.version` pour la phase 2

**Décision.** `version` est incrémentée à chaque mise à jour par trigger. Elle ne sert à rien
en V1 ; elle permettra la détection de conflits de synchronisation hors réseau (phase 2) sans
changement de schéma.

## 2026-11-02 — La direction peut insérer un rapport

**Décision.** La direction, en lecture seule partout ailleurs, peut insérer une ligne
`reports` (et l'objet PDF correspondant) sur toute visite lisible : elle génère et télécharge
des rapports sans modifier la visite. Les rapports ne sont jamais modifiés ni supprimés.

## 2026-11-02 — Cycle de vie par RPC et colonnes protégées

**Décision.** `status`, `completed_*` et `deleted_*` des visites, et `deleted_*` des réserves,
ne sont modifiables que par les RPC `security definer`, qui vérifient les droits, posent un
marqueur transactionnel (`ronde.rpc`) contrôlé par trigger et écrivent dans `audit_log`.

**Motivation.** Une seule implémentation des règles, dans la base, testée rôle par rôle ; les
écrans n'ont qu'à appeler la RPC.

## 2026-11-02 — Profils : lecture limitée par privilèges de colonnes

**Décision.** Les utilisateurs lisent `id`, `full_name`, `role` et `is_active` de tous les
profils (choix d'un responsable ou d'un participant) ; `email` et `must_change_password` sont
lus côté serveur avec le client `service_role`. Un `select *` sur `profiles` échoue donc pour
un utilisateur : les repositories sélectionnent les colonnes explicitement.

## 2026-11-02 — Accès aux données par Postgres direct (pg + Kysely) avec contexte RLS par transaction

**Décision.** Toutes les lectures et écritures de données passent par une connexion Postgres
directe (`pg` + Kysely), jamais par l'API REST de Supabase. Chaque opération s'exécute dans une
transaction courte qui fixe `set local role authenticated` et `request.jwt.claims` à partir de
l'utilisateur **vérifié côté serveur** (`withUser`) ; les opérations d'administration explicites
passent par `withSystem(reason)`. Supabase Auth reste derrière `AuthService` ; une
implémentation `local` (comptes dans `auth.users` de la base locale, cookie JWT signé) est
réservée aux tests et au développement et refusée sur Vercel ou sur une base distante.

**Motivation.** Dans Claude Code comme en CI, il n'y a ni Docker, ni GoTrue, ni PostgREST :
seulement PostgreSQL. L'application devient testable de bout en bout en local, et la V2 sur le
serveur interne (PostgreSQL) ne change que l'implémentation d'`AuthService` et de
`StorageService`. La RLS reste la barrière de sécurité : le rôle et `is_active` sont relus dans
`profiles` à chaque requête, jamais pris dans un cookie ou un JWT.

## 2026-11-02 — `authInterrupts` (expérimental) pour la page 403

**Décision.** `requireRole` appelle `forbidden()` de Next 15.5 (option expérimentale
`experimental.authInterrupts`) pour rendre `src/app/forbidden.tsx` avec un vrai statut HTTP 403.

**Conséquence.** À revérifier à chaque montée de version de Next : l'option peut changer de nom,
devenir stable ou disparaître. Le test e2e « Alice reçoit la 403 » vérifie le statut.

## 2026-11-02 — Un compte ne se supprime jamais

**Décision.** Les tables d'historique (`audit_log`, `reserve_events`, `reports`,
`site_import_runs`) référencent `profiles` avec `on delete restrict`, et un trigger
`before delete` sur `profiles` refuse toute suppression avec le message « RONDE: un compte ne se
supprime pas, il se désactive (historique attribué) », y compris en cascade depuis `auth.users`.

**Motivation.** L'historique reste attribué à son auteur. Pour le RGPD, une anonymisation (nom et
email remplacés, compte désactivé) viendra à l'étape 11.

## 2026-11-02 — Import des sites : simulation puis application

**Décision.** L'import du CSV VIGIE se fait en deux temps : une **simulation** qui calcule le
plan (créations, mises à jour avec diff, inchangés, réactivations, désactivations, rejets) sans
rien écrire, puis une **application** en une seule transaction, qui recalcule le plan sur
l'état courant et refuse si l'empreinte du fichier ou les compteurs diffèrent de la simulation.

**Motivation.** L'admin voit exactement ce qui va changer avant d'agir ; un import concurrent
ou un fichier modifié ne peut pas produire un résultat différent de celui validé.

## 2026-11-02 — Désactivation seulement en référentiel complet, garde-fou des 20 %

**Décision.** Un site actif absent du fichier n'est désactivé que si l'admin coche « Ce fichier
contient tout le référentiel ». Si cette désactivation toucherait plus de 20 % des sites actifs,
l'application exige une confirmation explicite. Aucun site n'est jamais supprimé.

**Motivation.** Un export partiel ou tronqué est l'erreur la plus probable ; elle ne doit pas
vider le référentiel.

## 2026-11-02 — Une cellule vide n'efface rien par défaut

**Décision.** Une valeur vide dans le fichier conserve la valeur enregistrée, sauf si l'option
« Une cellule vide efface la valeur existante » est cochée. Le rapport indique le nombre de
valeurs conservées.

## 2026-11-02 — Le fichier importé n'est pas conservé

**Décision.** Seuls le nom du fichier, son empreinte SHA-256, les options et le rapport
(compteurs, rejets) sont stockés dans `site_import_runs`. Le contenu n'est jamais stocké.

**Motivation.** Pas de donnée inutile en base ; l'empreinte suffit à relier une application à
sa simulation et à retrouver le fichier d'origine chez l'admin.

## 2026-11-02 — Limite de 4 Mo par requête serveur

**Décision.** Aucun fichier de plus de 4 Mo ne transite par une action serveur ou une route
(`experimental.serverActions.bodySizeLimit = 4mb`, CSV d'import limité à 4 Mo). Photos, plans
et rapports PDF seront envoyés directement au stockage par URL signée (étape 7).

**Motivation.** Vercel limite le corps des requêtes à 4,5 Mo ; passer par le serveur pour les
fichiers lourds serait de toute façon un goulot.

## 2026-11-02 — Enregistrement automatique avec `version`

**Décision.** L'onglet Informations enregistre au `blur` et 800 ms après la dernière frappe,
sans bouton global, en envoyant la version connue de la visite. Un conflit (`0` ligne
modifiée) affiche le nom du dernier auteur et propose de recharger ; rien n'est écrasé. Les
écritures de participants incrémentent la version de la visite parente par trigger
(`touch_parent_visit`), afin que tout chemin d'écriture, interface ou synchronisation future,
soit couvert.

**Motivation.** Saisie au doigt sur site sans perte ; préparation de la synchronisation hors
réseau (phase 2).

## 2026-11-02 — Site non modifiable après création

**Décision.** Le site d'une visite est immuable (trigger). L'interface l'affiche en lecture
seule avec la mention correspondante.

**Motivation.** Les réserves sont numérotées par site et rattachées au site de leur visite ;
changer de site casserait cette cohérence.

## 2026-11-02 — Duplication sans réserves

**Décision.** « Dupliquer » reprend le site, le type, le motif, l'objet, le rédacteur et les
participants (tous présents) ; ni notes, ni photos, ni repères, ni réserves, ni rapports. La
reprise des réserves ouvertes à la visite suivante viendra en phase 2.

## 2026-11-02 — Un participant lié obtient le droit de modification

**Décision.** Ajouter un collègue RONDE comme participant (`profile_id`) lui donne le droit de
modifier la visite tant qu'elle est en cours (règle RLS existante). Le dialogue l'indique.

**Motivation.** Les visites se font souvent à plusieurs RT ; le collègue présent doit pouvoir
saisir sans que le créateur ait à déléguer explicitement.

## 2026-11-02 — Pas de `Suspense` autour des onglets de la visite (ni du formulaire de recherche des sites)

**Décision.** La page `/visites/[id]` rend ses onglets sans frontière `Suspense`. Les autres
frontières (`FlashToast`, filtres des listes) restent, car leur contenu est petit.

**Motivation.** React découpe en flux toute frontière `Suspense` dont le HTML dépasse environ
12 Ko, même si rien ne suspend : le contenu arrive dans un segment caché révélé après coup.
Sous charge (quatre travailleurs Playwright), la révélation et l'hydratation se croisaient et la
page gardait une copie serveur cachée du formulaire à côté de la copie cliente (deux
`#visit-title`). La page est dynamique (session relue à chaque requête), donc
`useSearchParams` n'exige aucune frontière.

## 2026-11-02 — Version par note pour le contenu, par visite pour la structure

**Décision.** `visit_zone_notes.version` est incrémentée par trigger quand le **contenu** d'une
note change (et seulement lui) ; `updated_by` et `updated_at` suivent le contenu. L'ajout, le
retrait, le renommage et le réordonnancement des zones incrémentent `visits.version` (trigger
d'instruction, une fois par instruction), et pas le contenu.

**Motivation.** Deux RT doivent pouvoir écrire dans deux zones différentes de la même visite
sans conflit, et la saisie d'un texte ne doit pas invalider le formulaire d'informations ouvert
sur un autre poste. La structure, elle, est partagée par tous les écrans : elle suit la version
de la visite comme les participants.

## 2026-11-02 — Trame « réunion » provisoire

**Décision.** Une visite de type `meeting` reçoit une trame provisoire de trois zones (`agenda`,
`discussion`, `decisions`), marquée `// provisoire : trames par motif en phase 2` dans
`templates.ts`.

**Motivation.** Le cahier des charges demande une trame par motif en phase 2 ; en attendant,
une réunion sans aucune zone serait inutilisable dans l'onglet Notes.

## 2026-11-02 — Pas de stockage local avant la phase 2

**Décision.** L'enregistrement automatique garde le texte dans l'éditeur et réessaie (1 s,
2 s, 5 s, 10 s, puis toutes les 30 s), avertit avant de quitter la page tant qu'un
enregistrement est en attente, mais n'écrit rien dans le stockage du navigateur.

**Motivation.** Le vrai hors-ligne (stockage local, synchronisation, réconciliation) est un
chantier à part entière prévu en phase 2 ; un stockage local partiel créerait des états
incohérents difficiles à expliquer.

## 2026-11-02 — Retrait d'une zone seulement si elle est vide

**Décision.** « Retirer » est refusé tant que la zone a du contenu (« Videz la zone avant de
la retirer ») ; le bouton est désactivé avec l'explication. Les étapes 7 et 9 ajouteront la
vérification « aucune photo ni réserve liée » au même endroit (point d'extension commenté dans
`ZoneNoteRepository.remove`).

**Motivation.** Une zone retirée l'est définitivement (pas de corbeille) ; vider d'abord est un
geste explicite qui évite de perdre des observations par erreur.

## 2026-11-03 — `withSystem` en `service_role`, rôle de connexion dédié

**Décision.** `withSystem` exécute sa transaction après `set local role service_role`, au lieu
de s'appuyer sur les droits du propriétaire de la connexion. En production, l'application se
connecte avec un rôle dédié (`ronde_app`, `noinherit`, membre de `authenticated` et de
`service_role`) à travers le pooler en mode transaction, jamais avec `postgres`. La migration
13 accorde `private.audit` à `service_role`.

**Motivation.** Le mot de passe de `postgres` n'est pas modifiable par le connecteur Supabase
et ne doit pas circuler ; un rôle dédié limite les droits de l'application à ceux de la
plateforme (`service_role` contourne la RLS, rien de plus) et rend le comportement identique
entre la base de test locale et Supabase.

## 2026-11-03 — Sortie photo toujours en JPEG

**Décision.** Quel que soit le format d'entrée (JPEG, PNG, WebP), la photo stockée et sa
miniature sont des JPEG (qualité 0,8 à 1600 px, 0,7 à 400 px) ; la transparence devient
blanche.

**Motivation.** Le moteur PDF de l'étape 10 ne lit que JPEG et PNG, le JPEG est le plus
compact pour des photos de chantier, et un seul format simplifie `stat`, les limites et les
politiques des buckets.

## 2026-11-03 — Compression dans le navigateur

**Décision.** Le redimensionnement et l'encodage ont lieu dans le navigateur (Web Worker +
`OffscreenCanvas` quand c'est possible), avant tout envoi ; l'original n'est jamais transmis.

**Motivation.** Aucun fichier ne peut transiter par une action serveur ni une route (limite
Vercel de 4,5 Mo), le serveur n'a pas à décoder des images de 12 Mpx, et la tablette envoie
dix fois moins d'octets sur un réseau d'entrepôt souvent médiocre.

## 2026-11-03 — Miniature stockée, pas de transformation d'image Supabase

**Décision.** Chaque photo a deux objets : l'image principale et une miniature de 400 px,
toutes deux produites par le navigateur.

**Motivation.** Les transformations d'image à la volée de Supabase Storage sont réservées aux
offres payantes et n'existent pas dans l'implémentation locale ni sur le futur serveur interne
(V2) ; une miniature stockée coûte quelques kilo-octets et se sert par une simple URL signée.

## 2026-11-03 — La ligne `pending` est la preuve d'autorisation

**Décision.** Aucune URL d'envoi n'est signée sans qu'une ligne `photos` en `pending` ait été
insérée sous RLS (`withUser`) ; aucune URL de lecture sans lecture de la ligne sous RLS. La
confirmation repasse par RLS pour passer en `ready`. Règle inscrite dans `CLAUDE.md`.

**Motivation.** Les deux implémentations du stockage contournent les politiques du stockage
(clé `service_role`, fichiers locaux) : la seule autorité est la base. Si la RLS accepte
l'insertion, l'utilisateur peut modifier la visite ; la ligne porte en plus le chemin exact
qui sera signé, et une ligne jamais confirmée reste invisible puis est purgée.

## 2026-11-03 — EXIF supprimé, seule la date de prise de vue est conservée

**Décision.** Le ré-encodage retire toutes les métadonnées (GPS, appareil, numéro de série) ;
`DateTimeOriginal` est lue avant et stockée dans `taken_at`.

**Motivation.** RGPD et minimisation : la position de la tablette et l'identité de l'appareil
n'ont aucune utilité métier ; la date de prise de vue, si.

## 2026-11-03 — Plafond de 500 photos par visite

**Décision.** La préparation refuse toute photo au-delà de 500 par visite, lignes `pending`
comprises, sous un verrou par visite.

**Motivation.** Une visite technique réelle compte quelques dizaines de photos ; 500 couvre
les cas extrêmes tout en bornant le volume stocké (environ 200 Mo), la taille du rapport PDF
et la mémoire de la galerie sur tablette.

## 2026-11-03 — URL d'envoi Supabase valables 2 heures (durée fixée par l'API)

**Décision.** Le fournisseur local signe des URL d'envoi de 2 minutes ; `createSignedUploadUrl`
de Supabase Storage impose 2 heures, sans option. Le service renvoie la vraie expiration lue
dans le jeton.

**Motivation.** Pas de contournement possible côté API ; la ligne `pending` (preuve
d'autorisation), la vérification à la confirmation (taille, type) et la purge limitent la
portée d'une URL d'envoi divulguée à l'écrasement d'un objet que l'utilisateur pouvait de
toute façon écrire.

## 2026-11-04 — Claude Code ne modifie jamais un environnement distant

**Décision.** Claude Code ne lance aucune migration, aucune écriture ni aucun `db push` sur un
projet Supabase autre que la base locale `ronde_test`, même si des identifiants ou des
connecteurs sont disponibles dans sa session. Les migrations distantes sont appliquées par
Léandre depuis son PC, d'abord sur le projet de test puis sur la production, selon
`docs/deploy.md`. Les déploiements de prévisualisation Vercel pointent sur le projet de test ;
la production ne se déploie que depuis `main`.

**Motivation.** À l'étape 7, la migration 14 a été appliquée en production par le connecteur
Supabase de la session, parce que les déploiements automatiques de la branche de travail
pointaient déjà sur cette base. Ce double couplage (accès d'écriture depuis la session et
production déployée depuis une branche de travail) est acceptable avec des données de test,
pas pour le pilote : la base de production doit n'avoir qu'un seul opérateur, humain, avec une
procédure écrite et une liste de contrôle.

## 2026-11-04 — Pages de plans converties en images dans le navigateur

**Décision.** Chaque page d'un plan PDF est dessinée par `pdfjs-dist` dans le navigateur et
stockée comme image (plus une miniature) ; l'affichage, les repères et le futur rapport PDF ne
lisent que ces images. Le fichier d'origine est conservé pour être retéléchargé.

**Motivation.** Aucun fichier ne peut transiter par le serveur (limite Vercel de 4,5 Mo), le
serveur n'a pas à embarquer un moteur PDF, la visionneuse affiche une simple image zoomable sur
tablette, et le moteur PDF de l'étape 10 sait insérer des images PNG et JPEG mais pas des pages
de PDF tiers.

## 2026-11-04 — 3 500 px par page, PNG jusqu'à 8 Mo puis JPEG 0,9

**Décision.** Les pages sont rendues à 3 500 px sur leur plus grand côté (2 500 px en repli si
le canvas échoue), en PNG tant que l'image fait au plus 8 Mo, sinon en JPEG qualité 0,9.

**Motivation.** Un A1 paysage à 3 500 px garde un trait de 1 mm lisible avec le zoom de la
tablette, tout en restant sous la limite de canvas des navigateurs mobiles (16,7 millions de
pixels). Le PNG garde les traits nets et reste léger sur un dessin au trait (240 Ko par page de
test) ; le JPEG ne sert qu'aux plans scannés ou très hachurés.

## 2026-11-04 — Numéros de repères stables

**Décision.** Le numéro d'un repère vient d'un compteur par `(visite, plan)`
(`plan_marker_counters`, migration 17) ; il n'est jamais réattribué après une suppression, même
celle du dernier repère. (Jusqu'à la migration 17, « plus grand numéro + 1 » rendait le numéro du
dernier repère supprimé : corrigé à l'étape 10.)

**Motivation.** Les libellés, les légendes et le rapport citent « repère 3 » : renuméroter après
une suppression ferait pointer ces références vers un autre endroit. Les trous sont un moindre
mal, compréhensible par tous.

## 2026-11-04 — Zoom par Pointer Events, sans bibliothèque

**Décision.** Le zoom et le déplacement de la visionneuse de plan sont écrits avec les Pointer
Events (environ 200 lignes) et une géométrie pure testée, plutôt qu'avec `react-zoom-pan-pinch`.

**Motivation.** Il faut distinguer finement un toucher (qui place un repère) d'un pincement ou
d'un glisser (qui ne doivent jamais en placer), et dessiner les repères à taille fixe hors du
calque zoomé : une bibliothèque générique masque ces événements ou impose sa propre couche de
transformation. Le code maison garde la conversion écran ↔ coordonnées relatives testable
unitairement.

## 2026-11-04 — Réserve modifiable seulement pendant la visite (V1)

**Décision.** En V1, une réserve ne se modifie, ne se lève et ne se supprime que tant que sa
visite est en cours (règle `can_edit_visit` déjà appliquée par la RLS). Une visite terminée
fige ses réserves ; le suivi après visite (levée par un autre RT, preuve) viendra avec la
phase de suivi.

**Motivation.** Choix validé par Léandre à la revue de l'étape 8 : une seule règle de droit,
déjà testée, et un rapport PDF (étape 10) qui reflète l'état de la visite à sa clôture.

## 2026-11-04 — Responsable facultatif (« À désigner »)

**Décision.** Le responsable d'une réserve peut rester vide. Quand il est renseigné, la base
vérifie sa cohérence (profil interne seul, ou nom externe non vide). Les réserves sans
responsable remontent dans les points à compléter.

**Motivation.** Sur le terrain, l'entreprise à mandater n'est souvent pas connue au moment du
constat ; imposer un responsable pousserait à saisir n'importe qui.

## 2026-11-04 — Un repère au plus par réserve, colonne sur `plan_markers`

**Décision.** Le lien réserve → plan est une colonne `plan_markers.reserve_id` avec un index
unique partiel, plutôt qu'une table de liaison. Placer une réserve déjà placée déplace son
repère (ou le recrée sur un autre plan). « Créer une réserve ici » transforme le repère simple
existant en repère de la réserve.

**Motivation.** Une réserve désigne un endroit ; plusieurs repères pour une même réserve
brouilleraient le plan et le rapport. Réutiliser `plan_markers` garde la numérotation, les
droits et la visionneuse existants.

## 2026-11-04 — Le repère d'une réserve supprimée est supprimé

**Décision.** `soft_delete_reserve` supprime physiquement le repère de la réserve dans la même
transaction ; la réserve, elle, reste en base (suppression logique) avec son numéro.

**Motivation.** Un repère pointant vers une réserve invisible tromperait le lecteur du plan ;
le garder masqué compliquerait chaque lecture. L'historique de la réserve et le journal d'audit
gardent la trace de la suppression.

## 2026-11-04 — Photos de preuve (`proof`) refusées jusqu'à l'étape 13

**Décision.** Le trigger `reserve_photos_check` n'accepte que le type `defect`. Une migration de
l'étape 13 ouvrira `proof` avec son parcours (levée avec photo de preuve).

**Motivation.** Aucun écran ne produit encore de photo de preuve : l'accepter en base laisserait
entrer des données sans règle d'affichage ni de droits.

## 2026-11-05 — Rapport PDF généré dans le navigateur, mise en page dans un Web Worker

**Décision.** Le PDF est produit dans le navigateur avec `@react-pdf/renderer` 4.9.0 ; la mise
en page tourne dans un **Web Worker** (`report.worker.tsx`), le fil principal ne servant qu'en
repli si le worker ne peut pas démarrer.

**Motivation.** Aucun fichier de plus de 4 Mo ne peut transiter par le serveur et Vercel n'est
pas fait pour du calcul long. Mesures sur la visite de démonstration (40 photos, 2 pages de
plan) : sur le fil principal, la plus longue tâche bloque l'interface 0,54 s, et **2,6 s** avec
un processeur ralenti ×4 (au-delà de la limite d'une seconde) ; avec le worker, la plus longue
tâche du fil principal est de 0,08 s (0,36 s ralenti ×4), la progression et « Annuler » restent
réactifs. La bibliothèque fonctionne telle quelle dans un worker de module (polices chargées par
URL, aucune API du DOM).

## 2026-11-05 — Polices du rapport en fichiers locaux

**Décision.** Bricolage Grotesque (600, 700) et Instrument Sans (400, 600, italique 400) sont
versionnées en TTF statiques dans `public/fonts/report/` avec leur licence OFL ; la césure est
désactivée.

**Motivation.** Aucune requête vers Google ou un CDN au moment de la génération (hors ligne
possible, données non exposées), rendu identique d'une génération à l'autre, polices intégrées au
PDF. Les mêmes fichiers serviront à `next/font/local` à l'étape 11. Pas de mot coupé en français.

## 2026-11-05 — Modèle pur séparé du rendu

**Décision.** Une lecture serveur (`getReportData`, DTO figé) ; une fonction pure
`buildReportModel(dto, options, now)` calcule tout ce qui s'imprime (tri, figures, références,
libellés, nom de fichier) ; les composants PDF n'affichent que ce modèle.

**Motivation.** Tests unitaires rapides sur toute la logique ; deux rendus du même modèle à la
même date donnent le même document ; une section s'ajoute sans toucher au rendu des autres.

## 2026-11-05 — Pas d'e-mail dans le rapport

**Décision.** Le DTO du rapport ne lit aucun e-mail (participants, responsables externes) ; un
responsable figure par son nom et son entreprise.

**Motivation.** Le rapport est diffusé aux exploitants et prestataires et sera publié vers
VIGIE : il ne doit pas propager de données personnelles de contact. Un test vérifie qu'aucune
adresse n'apparaît, ni dans le modèle ni dans le texte du PDF.

## 2026-11-05 — Compteur des repères

**Décision.** Le numéro d'un repère vient de `plan_marker_counters` (upsert dans le trigger
d'insertion), et non plus du plus grand numéro + 1.

**Motivation.** « Plus grand + 1 » rendait le numéro du dernier repère supprimé, alors que les
légendes et les rapports déjà diffusés citent ces numéros.

## 2026-11-05 — `next/font/local` pour l'interface (étape 11)

**Décision.** Les polices de l'interface passent de `next/font/google` à `next/font/local` :
`public/fonts/web/` contient Bricolage Grotesque 700, Instrument Sans variable (400 à 700) et
Caveat 700 en woff2 (latin et latin étendu), avec leurs licences OFL.

**Motivation.** `next/font/google` téléchargeait les polices au build : le futur serveur interne,
sans accès à Internet, ne pourrait pas construire l'application. Les fichiers reprennent les
mêmes instances que celles servies par Google : les captures avant et après sont identiques au
pixel près (`/design`, une visite, `/connexion`).
