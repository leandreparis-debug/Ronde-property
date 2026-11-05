# Journal des modifications

Toutes les évolutions notables de RONDE. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versions selon [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Prévu

- Étape 12 (phase 2) : travail hors ligne complet (file persistante, service worker,
  synchronisation), retours du pilote sur les rapports PDF.

## [1.0.0] - 2026-11-05

Première version complète de la phase 1, prête pour le pilote des RT.

### Ajouté

- **Étape 1, fondations** : Next.js 15 (App Router), TypeScript strict, Tailwind 4 par tokens,
  design system (mascotte « Galet », primitives, page `/design`), coquille (navigation latérale
  sur PC, barre du bas sur tablette), CI.
- **Étape 2, modèle de données** : schéma Postgres, RLS par rôle (RT, direction, admin),
  triggers d'audit, `audit_log` et `reserve_events` en ajout seul, tests de la base sur une
  émulation de Supabase.
- **Étape 3, authentification** : `AuthService` (Supabase, et `local` pour les tests),
  rôles relus en base à chaque requête, comptes créés par l'admin avec mot de passe provisoire,
  journal d'audit consultable.
- **Étape 4, référentiel des sites** : import du CSV VIGIE (simulation puis application en une
  transaction, garde-fou de désactivation massive), recherche sans accents.
- **Étape 5, visites** : création sur un site du référentiel, fiche en onglets, participants,
  cycle de vie (terminer, rouvrir, dupliquer, supprimer), concurrence optimiste.
- **Étape 6, notes par zone** : trames par type de visite, puces, enregistrement automatique,
  conflits par zone sans perte.
- **Étape 7, photos** : prise et import sur la tablette, compression et suppression de l'EXIF
  dans le navigateur, envoi direct au stockage par URL signée, photo de garde, visionneuse.
- **Étape 8, plans et repères** : import de plans AutoCAD (PDF ou image) convertis dans le
  navigateur, visionneuse au doigt, repères numérotés de façon stable, archivage.
- **Étape 9, réserves** : création rapide, priorités, échéances et retards, responsable interne
  ou externe, photos, placement sur le plan, historique, levée et réouverture.
- **Étape 10, rapport PDF** : généré dans le navigateur (Web Worker), conservé avec son
  historique, brouillon tant que la visite est en cours, options et qualité « Légère ».
- **Étape 11, recette et mise en production** :
  - recette des 6 critères du cahier des charges (`pnpm test:acceptance`), C6 préparé ;
  - application installable (manifeste, icônes générées, écrans de démarrage iOS), bandeau et
    page hors connexion, sans service worker de cache ;
  - sécurité : CSP à nonce, HSTS, `Permissions-Policy`, déconnexion de toutes les sessions,
    audit automatique de la RLS, `pnpm audit`, Dependabot, gitleaks, journaux masqués, pages
    d'erreur ;
  - purge nocturne des envois abandonnés (`/api/cron/purge`, Vercel Cron) ;
  - RGPD : anonymisation d'un compte désactivé, export JSON d'un compte, effacement des
    e-mails des responsables externes après 24 mois, `docs/rgpd.md` ;
  - pilote : « Donner mon avis », `/admin/avis` avec export CSV, guides des RT et de l'admin
    servis sur `/aide`, menu du compte avec la version ;
  - exploitation : `docs/go-live.md`, `pnpm test:contract`, `scripts/ops/purge-demo-data`,
    estimation du stockage, `docs/migration-serveur-interne.md`, `docs/reprise.md`.

### Modifié

- Polices de l'interface servies par `next/font/local` (aucun appel à Google, ni au build ni à
  l'exécution).
- Formulaires Informations et Réserve : saisie conservée et message « Hors connexion » quand
  le serveur est injoignable.

### Corrigé

- Double état vide sur `/sites?q=…` (frontière Suspense implicite du `loading.tsx`).
- L'e-mail d'un responsable externe n'est plus copié dans l'historique des réserves.
- Vues `visit_summaries` et `reserves_with_state` en lecture seule, sans droit pour `anon`.
- Vulnérabilités de `postcss` et `sharp` tirés par Next.js (versions corrigées imposées).

### Sécurité

- Migrations 18 à 20 à appliquer par Léandre (`docs/go-live.md`, ligne 5).

[Non publié]: https://github.com/leandreparis-debug/Ronde-property/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/leandreparis-debug/Ronde-property/releases/tag/v1.0.0
