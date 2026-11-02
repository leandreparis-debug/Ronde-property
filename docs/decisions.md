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
