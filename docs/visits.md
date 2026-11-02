# Visites

## Cycle de vie

```
création ──▶ en cours ──(Terminer)──▶ terminée ──(Rouvrir)──▶ en cours
                │                         │
                └────────(Supprimer)──────┴──▶ supprimée (logique, visible par l'admin)
```

| Étape     | Qui                                                                              | Comment                                                                                                                                                | Trace                                       |
| --------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Création  | RT, admin                                                                        | `/visites/nouvelle` (type, motif, site du référentiel, date, titre proposé, rédacteur) ou « Nouvelle visite sur ce site » depuis une fiche site        | `visit.created`                             |
| Saisie    | créateur, rédacteur, participant lié, admin, **tant que la visite est en cours** | onglet Informations : enregistrement automatique au `blur` et 800 ms après la dernière frappe ; participants                                           | `visit.updated` (champs modifiés)           |
| Terminée  | qui peut modifier                                                                | « Terminer la visite » : dialogue qui rappelle les points à compléter sans bloquer, puis `complete_visit`                                              | `visit.completed`                           |
| Rouverte  | créateur, rédacteur, admin                                                       | « Rouvrir », puis `reopen_visit`                                                                                                                       | `visit.reopened`                            |
| Supprimée | créateur, rédacteur, admin                                                       | « Supprimer » (confirmation, bouton danger), puis `soft_delete_visit` ; disparaît de la liste, 404 pour tous sauf l'admin, qui la voit avec un bandeau | `visit.deleted`                             |
| Dupliquée | RT, admin                                                                        | « Dupliquer » : nouvelle visite en cours sur le même site                                                                                              | `visit.created` (avec `duplicated_from_id`) |

Les droits sont appliqués par la RLS et les RPC de la base (`private.can_edit_visit`,
`private.can_manage_visit`) **et** vérifiés dans les actions serveur
(`requireRoleForAction(['rt', 'admin'])`). La direction ne modifie rien : bandeau « Vous
consultez cette visite en lecture seule », aucun contrôle d'édition, pas de bouton « Nouvelle
visite ».

## Qui peut faire quoi

| Action              | Créateur | Rédacteur | Participant lié (`profile_id`) | RT non concerné | Direction | Admin                      |
| ------------------- | -------- | --------- | ------------------------------ | --------------- | --------- | -------------------------- |
| Lire                | oui      | oui       | oui                            | oui             | oui       | oui (supprimées comprises) |
| Créer, dupliquer    | oui      | oui       | oui                            | oui             | non       | oui                        |
| Modifier (en cours) | oui      | oui       | oui                            | non             | non       | oui                        |
| Terminer (en cours) | oui      | oui       | oui                            | non             | non       | oui                        |
| Rouvrir (terminée)  | oui      | oui       | non                            | non             | non       | oui                        |
| Supprimer           | oui      | oui       | non                            | non             | non       | oui                        |

Ajouter un collègue RONDE comme participant **lui donne le droit de modifier la visite**
(l'aide du dialogue l'indique). Un même profil ne peut pas être ajouté deux fois.

## Duplication

Repris : le site, le type, le motif, l'objet, le rédacteur, le titre suffixé « (suite) », les
participants dans le même ordre, tous remis à « Présent ». La date est celle du jour (Europe/Paris)
et `duplicated_from_id` pointe vers l'origine.

Non repris : notes, photos, repères, réserves et rapports. La reprise des réserves ouvertes
viendra en phase 2.

## Concurrence optimiste

Chaque visite porte une `version`, incrémentée par trigger à chaque mise à jour, y compris
quand un participant est ajouté, modifié, réordonné ou retiré (trigger `touch_parent_visit`,
qui couvre tout chemin d'écriture). L'auteur de la dernière modification est conservé dans
`updated_by`.

- L'enregistrement automatique envoie la version connue : `update … where id = $1 and version = $2`.
- Si aucune ligne n'est modifiée alors que la visite existe, c'est un `ConflictError` affiché :
  « Cette visite a été modifiée entre-temps par {nom}. Rechargez pour voir la dernière version. »,
  avec le bouton « Recharger ». Rien n'est écrasé.
- Les écritures de participants vérifient la version avant d'écrire, puis renvoient la nouvelle
  version, partagée avec le formulaire d'informations.

Le site n'est pas modifiable après la création (trigger « site immuable ») : supprimez la
visite et recréez-la.

## Points à compléter

Un encadré « À compléter » liste, sans bloquer : « Rédacteur manquant », « Aucun participant »,
« Objet vide ». Chaque ligne mène au champ concerné. Le dialogue « Terminer la visite » les
rappelle.

## Règles de saisie

- `type = meeting` impose `reason = meeting` ; `type = technical` autorise les cinq autres motifs.
  Le champ motif s'adapte au type ; la règle est vérifiée côté serveur.
- Titre de 1 à 200 caractères, proposé « {Motif} — {nom du site} » dès que le site est choisi.
- Objet de 2 000 caractères maximum.
- Une date à plus d'un an dans le passé ou le futur affiche un avertissement non bloquant.
- Un site inactif ou inexistant est refusé à la création, avec un message clair.
