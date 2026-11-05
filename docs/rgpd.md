# RGPD

Ce document recense les données personnelles de RONDE, leurs durées de conservation et les
procédures pour exercer les droits des personnes. Les bases légales et les durées marquées
**« à valider »** doivent l'être par le délégué à la protection des données (DPO) de Carrefour
Property avant la mise en production (`docs/go-live.md`).

## Données personnelles

| Où                                         | Données                                                                                 | Personnes                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------- |
| `profiles`, `auth.users`                   | nom, e-mail professionnel, rôle, dates de connexion (audit)                             | RT, direction, admins             |
| `visit_participants`                       | nom, entreprise, fonction, e-mail (participants externes), présence                     | participants internes et externes |
| `reserves`                                 | nom, entreprise, **e-mail** du responsable externe                                      | prestataires                      |
| `photos` (fichiers)                        | images de site : une personne peut y figurer ; EXIF et GPS supprimés dans le navigateur | toute personne photographiée      |
| `visit_zone_notes`, `reserves.description` | texte libre : peut contenir un nom                                                      | toute personne citée              |
| `reports` (PDF)                            | nom du rédacteur, des participants et des responsables ; **jamais d'e-mail**            | idem                              |
| `audit_log`                                | identifiant de l'auteur, action, date ; e-mail seulement **haché**                      | utilisateurs                      |
| journaux du serveur                        | e-mails remplacés par leur empreinte, secrets masqués (`docs/security.md`)              | utilisateurs                      |
| cookies                                    | cookie de session `httpOnly` (aucun cookie de mesure d'audience)                        | utilisateurs                      |

L'adresse e-mail d'un responsable externe n'apparaît que dans le détail de la réserve : jamais
dans une liste, une URL, un rapport, un journal ni l'historique des réserves (masquée
`[masqué]` par la base depuis la migration 19).

## Qui y a accès

| Rôle      | Accès                                                                                        |
| --------- | -------------------------------------------------------------------------------------------- |
| RT        | visites dont il est l'auteur, le rédacteur ou un participant ; réserves de ses sites         |
| Direction | lecture seule de toutes les visites, réserves et rapports                                    |
| Admin     | comptes (e-mails compris), imports, journal d'audit, avis du pilote, export et anonymisation |
| Léandre   | base et stockage (exploitation), uniquement pour la maintenance et les demandes RGPD         |

Les règles sont appliquées par la base (RLS) : `docs/security.md`.

## Consigne aux RT pour les photos

Éviter les **visages** et les **plaques d'immatriculation** : cadrer sur l'installation. Une
photo où une personne est reconnaissable se supprime dans l'onglet Photos tant que la visite
est modifiable (rappel dans `docs/guide-rt.md`).

## Finalités, bases légales et durées

| Données                                      | Finalité                           | Base légale (à valider)               | Conservation                                                                                                                                                               |
| -------------------------------------------- | ---------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comptes                                      | accès à l'application, traçabilité | intérêt légitime / contrat de travail | tant que la personne a besoin de l'accès ; désactivation au départ, **anonymisation** sur demande ou après un délai à fixer (proposition : 12 mois après la désactivation) |
| Participants, responsables (nom, entreprise) | compte rendu et suivi des réserves | intérêt légitime                      | durée de vie du site (historique des visites)                                                                                                                              |
| E-mail des responsables externes             | relance des réserves               | intérêt légitime                      | **24 mois après la levée** de la réserve, puis effacé (script ci-dessous)                                                                                                  |
| Photos, notes, rapports                      | preuve de l'état du site           | intérêt légitime                      | durée de vie du site (à valider)                                                                                                                                           |
| Journal d'audit                              | sécurité, traçabilité              | obligation de sécurité                | en ajout seul ; durée à fixer (proposition : 5 ans), purge à prévoir en V2                                                                                                 |

## Droits des personnes

### Accès et portabilité : export JSON

`/admin/comptes` → **« Exporter les données »** sur la ligne du compte. Le fichier
`ronde-compte-<id>-<date>.json` contient le profil, les visites créées ou rédigées, les
participations, les réserves créées, levées ou confiées, les photos et rapports produits, les
imports de sites et les entrées du journal qui concernent le compte. Aucune adresse e-mail d'une
autre personne n'y figure. Trace : « Données du compte exportées ».

Pour un **participant externe** ou un **responsable de réserve** (sans compte) : rechercher son
nom dans les visites et les réserves du site concerné ; une extraction SQL en lecture seule est
possible par Léandre si besoin.

### Rectification

Le nom d'un compte se modifie dans `/admin/comptes` (« Modifier ») ; un utilisateur modifie son
propre nom dans « Mon compte ». Participants et responsables se corrigent dans la visite ou la
réserve (tant qu'elle est modifiable).

### Effacement : anonymisation d'un compte

Un compte ne se supprime jamais (son historique en dépend) ; il s'**anonymise** :

1. le **désactiver** (« Désactiver ») : ses sessions sont coupées ;
2. **« Anonymiser »** (proposé seulement pour un compte désactivé) ;
3. première confirmation : lire l'avertissement, « Continuer » ;
4. seconde confirmation : **saisir le nom complet** du compte, exactement ; le serveur le
   vérifie aussi.

Effet (fonction `private.anonymize_profile`, irréversible) : nom remplacé par « Compte
anonymisé XXXXXX » et e-mail par une adresse `@ronde.invalid` dans le profil et dans ses
participations ; identité de connexion remplacée et bloquée ; sessions révoquées ; trace « Compte
anonymisé ». Le compte ne peut plus être réactivé ni renommé.

**Limites** : les rapports PDF déjà générés sont figés (règle 31) et gardent le nom ; les
textes libres (notes, descriptions) et les photos ne sont pas modifiés automatiquement : les
relire si la demande l'exige.

### Effacement des e-mails des responsables externes

`scripts/ops/clear-external-emails.mjs` efface l'e-mail des responsables externes des réserves
**levées depuis plus de N mois** (24 par défaut). Le nom et l'entreprise restent. **Simulation
par défaut** ; l'application demande de saisir l'identifiant du projet. Le script refuse de
s'exécuter si `DATABASE_URL` ne pointe pas vers le projet annoncé.

Pas à pas pour Léandre (PC Windows, PowerShell, dans le dossier du dépôt) :

1. Récupérer la chaîne de connexion du projet : Supabase → projet → Connect → « Session
   pooler » (utilisateur `postgres.<identifiant>`), mot de passe de la base.
2. Ouvrir PowerShell dans le dossier du dépôt, puis :

   ```powershell
   $env:DATABASE_URL = "postgresql://postgres.<identifiant>:<mot de passe>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"
   node scripts/ops/clear-external-emails.mjs --project-ref <identifiant>
   ```

   La simulation affiche la cible et le nombre d'adresses concernées, sans rien modifier.

3. Pour effacer : relancer avec `--apply`, puis saisir l'identifiant du projet quand il est
   demandé.

   ```powershell
   node scripts/ops/clear-external-emails.mjs --project-ref <identifiant> --apply
   ```

4. Effacer la variable : `Remove-Item Env:DATABASE_URL`.
5. Vérifier dans RONDE, `/admin/journal` : « E-mails externes effacés » (délai et nombre).

Option `--months <N>` pour un autre délai ; `--local` pour essayer sur la base locale
`ronde_test`. À lancer une fois par mois (à inscrire au planning d'exploitation).

## Sous-traitants et hébergement (à compléter par Léandre)

- **Supabase** (base, authentification, stockage) : région du projet à indiquer (Europe
  attendue), contrat de sous-traitance (DPA) à signer dans le tableau de bord.
- **Vercel** (hébergement de l'application V1) : région des fonctions à indiquer, DPA.
- V2 : serveur interne Carrefour Property (`docs/migration-serveur-interne.md`), plus de
  sous-traitant pour l'hébergement.

## Tests

- `supabase/tests/migration19.test.ts` : historique sans e-mail, anonymisation (refus sur un
  compte actif, participations, irréversibilité, droits), effacement des e-mails (simulation,
  délai, audit).
- `tests/integration/ops-clear-external-emails.test.ts`, `tests/scripts/ops-target.test.ts` :
  garde de cible, simulation, confirmation saisie.
- `e2e/rgpd.spec.ts` : export JSON (aucun e-mail d'autrui), anonymisation en deux confirmations,
  ancienne identité refusée.
