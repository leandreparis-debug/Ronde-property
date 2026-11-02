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
