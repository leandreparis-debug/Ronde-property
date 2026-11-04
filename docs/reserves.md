# Réserves

L'onglet **Réserves** d'une visite recense les points à reprendre relevés pendant la visite,
jusqu'à leur levée. Chaque réserve porte un code stable par site (`R-07`), une action, une zone,
une priorité, une échéance, un responsable, des photos du défaut et, au besoin, un repère sur
un plan du site. La direction et les RT non impliqués les consultent en lecture seule ; la page
du site rassemble les réserves ouvertes de toutes ses visites.

## Règles

| Sujet            | Règle                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qui modifie      | Le créateur, le rédacteur, les participants de la visite et l'admin, **tant que la visite est en cours** (`can_edit_visit`). Visite terminée : lecture seule, même par action directe. |
| Numéro           | Séquentiel **par site**, attribué par trigger sous verrou consultatif, jamais réattribué (une réserve supprimée garde le sien).                                                        |
| Concurrence      | Chaque mise à jour envoie la `version` connue ; une version périmée renvoie la réserve actuelle et un message, **sans perdre la saisie**.                                              |
| Statuts          | `open` (Ouverte), `in_progress` (En cours), `done` (Levée). L'écran propose « Lever » et « Rouvrir » ; une réserve en cours peut être levée ou repassée en ouverte.                    |
| Levée            | `closed_at` et `closed_by` sont posés par trigger ; un retour à ouverte les efface. Les deux changements apparaissent dans l'historique.                                               |
| Retard           | Échéance **strictement** antérieure à la date du jour à Paris, réserve non levée. Échue aujourd'hui : à l'heure ; échue hier : « En retard de 1 j ».                                   |
| Responsable      | Interne (profil actif), entreprise extérieure (nom obligatoire, entreprise et e-mail facultatifs) ou **« À désigner »** (aucun champ).                                                 |
| E-mail externe   | Affiché **uniquement** dans le détail de la réserve : jamais dans les listes, les URL, les suggestions ni les journaux applicatifs.                                                    |
| Photos du défaut | Photos prêtes de la **même visite**, type `defect` uniquement (la photo de preuve viendra plus tard). Supprimer une photo ne supprime jamais la réserve.                               |
| Plan             | Au plus **un repère par réserve**, de la même visite ; la suppression de la réserve supprime son repère dans la même transaction.                                                      |
| Suppression      | Logique, par la RPC `soft_delete_reserve`, après une confirmation qui nomme la réserve. Tracée dans `reserve_events` et `audit_log`.                                                   |

## Écrans

### Onglet Réserves

- Compteurs « N ouvertes · N en retard · N levées ».
- Filtres reflétés dans l'URL (`?onglet=reserves&levees=afficher&statut=open&priorite=urgent&retard=1&zone=docks&tri=zone`) :
  « Masquer les levées » (actif par défaut), statut, priorité, « En retard uniquement », zone,
  tri. Choisir le statut « Levée » affiche les levées même masquées.
- Tri par défaut : non levées d'abord, puis en retard, priorité décroissante, échéance la plus
  proche (sans échéance en dernier), numéro. Autres tris : numéro, zone.
- Carte : code, action sur deux lignes, zone, priorité, responsable ou « À désigner »,
  échéance, statut, première miniature, icône de plan si la réserve est placée. En retard :
  bordure gauche rouge et « En retard de N j ». Levée : atténuée, « Levée le … par … ».
- États vides : galet content « Aucune réserve, tout est en ordre » ; « Aucune réserve
  ouverte · 3 levées masquées » avec « Afficher les levées ».
- « Nouvelle réserve » en haut (à partir de 1024 px) et en bouton flottant au-dessus de la barre
  de navigation sur tablette et téléphone.

### Feuille de création et de modification

Panneau latéral à partir de 1024 px, plein écran en dessous. Ordre des champs : **Action**
(obligatoire, 500 caractères, focus à l'ouverture), **Zone** (pré-remplie quand on vient d'une
zone), **Priorité** (quatre segments, Normale par défaut), **Échéance** (+7 j, +15 j, +1 mois,
+3 mois, sélecteur de date, « Aucune » ; une date passée demande une confirmation), **Responsable**
(Interne avec recherche / Entreprise extérieure avec les couples déjà utilisés sur le site / À
désigner), **Photos du défaut** (grille des photos de la visite filtrée par la zone de la réserve,
« Prendre une photo » qui passe par la file d'envoi et lie la photo dès sa confirmation, avec la
zone de la réserve), **Description** repliée.

« Enregistrer » ferme la feuille ; « Enregistrer et nouvelle » la vide (même zone, autres champs
par défaut) et replace le focus sur l'action. Le formulaire utilise `react-hook-form` et le
schéma zod partagé `reserveFormSchema` (`src/lib/reserves/schema.ts`), validé à nouveau par les
actions serveur. Les erreurs s'affichent sous le champ concerné.

**Nombre d'interactions mesuré** après « Nouvelle réserve » (test e2e) : 3 pour une réserve avec
une photo déjà prise (saisir l'action, toucher la photo, Enregistrer), 3 pour une réserve avec
une nouvelle photo (saisir l'action, « Prendre une photo », Enregistrer ; la prise de vue
elle-même se fait dans l'appareil photo).

### Détail

`/visites/{id}/reserves/{reserveId}` : tous les champs, l'e-mail du responsable externe, les
photos (lien vers la visionneuse), le lien « Voir sur le plan », l'**historique** lu dans
`reserve_events` (« Créée par Alice Fictive le 04/11/2026 10:30 », « Échéance : 12/11/2026 →
30/11/2026 par Bruno Fictif le … », « Levée par … ») et, pour un éditeur : Modifier, Lever /
Rouvrir, Placer (ou Déplacer) sur le plan, Retirer du plan, Supprimer.

### Sur le plan

- « Placer sur le plan » ouvre l'onglet Plans en mode placement (`?onglet=plans&placer={id}`) :
  « Choisissez le plan… », puis « Touchez le plan pour placer R-07 ». Le toucher crée le repère
  (ou le déplace) puis revient au détail.
- Dans la feuille d'un repère simple, « Créer une réserve ici » ouvre la feuille de réserve avec
  la photo du repère pré-liée ; à l'enregistrement, **ce repère devient celui de la réserve**.
- Repère de réserve : **pin carré** (jamais la forme du galet des repères simples) avec un point
  d'exclamation et le code « R-07 » ; rouge si ouverte ou en retard, ambre en cours, neutre avec
  une coche si levée. Les réserves levées sont masquées tant que « Masquer les levées » est actif
  (paramètre `levees` partagé avec l'onglet Réserves). Le toucher ouvre la réserve. Une légende
  accompagne la visionneuse.

### Liens

- Notes : sous chaque zone, « N réserves » (onglet filtré sur la zone) et « + Réserve » (zone
  pré-remplie).
- Photos : badge « R-07 » sur la miniature, mention « Photo de la réserve R-07 » avec un lien
  dans la visionneuse, avertissement dans la confirmation de suppression (la réserve reste).
- Points à compléter : « N réserves sans responsable », « N réserves sans échéance », « N
  réserves urgentes sans photo » (réserves non levées). Un repère de réserve n'est pas compté
  comme « repère sans photo ».
- Page du site : section « Réserves ouvertes » (compteurs ouvertes / en retard / urgentes, les
  10 plus urgentes, lien vers la visite d'origine), visible de tous.

## Code

| Élément                                   | Rôle                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `supabase/migrations/20261104120000_…sql` | Migration 16 : version, responsable facultatif, repère de réserve, contrôles des photos, vue |
| `src/server/reserves/repository.ts`       | `ReserveRepository` (lectures sur `reserves_with_state`, écritures sous RLS)                 |
| `src/server/reserves/service.ts`          | Signature des miniatures, historique lisible, résultat de conflit                            |
| `src/server/services/reserves.ts`         | `requireUser` / `requireRole(['rt','admin'])` puis service                                   |
| `src/server/actions/reserve-actions.ts`   | Actions serveur (validation zod, revalidation de la visite et des sites)                     |
| `src/lib/reserves/`                       | Schéma partagé, échéances (raccourcis, retard), tri / filtres / URL, liens                   |
| `src/components/reserves/`                | Onglet, carte, feuille, détail, section du site                                              |
| `tests/integration/reserves.test.ts`      | Droits (Alice, Bruno, Emma, Claire, David), concurrence, historique, plan, compteurs         |
| `supabase/tests/reserves-v16.test.ts`     | Contraintes et triggers de la migration 16                                                   |
| `e2e/reserves.spec.ts`                    | Parcours complets, axe, cibles de 44 px, tablette, lecture seule                             |
