# `src/server/` — couche d'accès aux données

Ce dossier est vide à l'étape 1. Il accueillera, à partir de l'étape 2, **toute** la couche
d'accès aux données, aux fichiers et à l'authentification :

- `repositories/` : un repository par agrégat (`SiteRepository`, `VisitRepository`,
  `ReserveRepository`, …), exposé sous forme d'interface TypeScript. L'implémentation V1 s'appuie
  sur Supabase (Postgres) ; la V2 fournira une implémentation pour le serveur interne.
- `storage/` : `StorageService` (photos, plans AutoCAD, rapports PDF). V1 : Supabase Storage.
- `auth/` : `AuthService` (session, rôles RT / Direction / Admin, journal d'audit). V1 : Supabase Auth.
- `supabase/` : création des clients Supabase (serveur et navigateur). **Seul** endroit du dépôt
  autorisé à importer `@supabase/*`.

## Règles

- Les composants, pages et actions serveur n'importent **jamais** le client Supabase directement :
  ils passent par les interfaces de ce dossier.
- Les implémentations sont injectées depuis un point unique (`src/server/index.ts`, à venir) pour
  que la migration V2 ne touche pas le reste de l'application.
- Aucune donnée réelle dans les fixtures de test : uniquement des données fictives.
