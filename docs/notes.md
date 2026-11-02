# Notes par zone

L'onglet **Notes** d'une visite permet au RT de saisir ses observations zone par zone, sur
tablette comme sur PC. Le découpage en zones sera réutilisé par le rapport PDF (étape 10), et
une photo (étape 7) ou une réserve (étape 9) pourront être rattachées à une zone par sa clé.

## Trames et zones

| Type de visite | Trame (`src/server/domain/templates.ts`)                                                                                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `technical`    | **visite technique** : `roof` Toiture, `docks` Quais, `sprinkler` Sprinklage, `facades` Façades et bardage, `smoke_extraction` Désenfumage, `electrical` Électricité et TGBT, `fences_access` Clôtures et accès, `drainage` Réseaux EU/EP, `fire_safety` Sécurité incendie |
| `meeting`      | **réunion** (provisoire, en attendant les trames par motif) : `agenda` Ordre du jour, `discussion` Points abordés, `decisions` Décisions et suites à donner                                                                                                                |

- La trame est insérée **à la création de la visite, dans la même transaction** : une visite
  n'existe jamais sans ses zones. Les visites plus anciennes sans aucune zone (la seed, par
  exemple) affichent un état vide avec le bouton « Insérer la trame {nom} ».
- Les **clés** (`zone_key`) sont stables : ce sont elles que les photos, les réserves et le
  rapport référencent. Les **libellés** sont modifiables, y compris pour les zones de la trame.
- Une zone ajoutée reçoit la clé `custom-{slug}-{suffixe}` (quatre caractères aléatoires),
  pour qu'un libellé réutilisé ou une zone retirée puis recréée ne provoque jamais de collision.
  Un libellé déjà présent (comparaison sans accents ni casse) est refusé.
- Une zone de la trame retirée peut être **remise** (« Remettre une zone de la trame ») ; elle
  revient en fin de liste avec son libellé d'origine.
- « Gérer les zones » : ↑ / ↓ (boutons de 44 px, pas de glisser-déposer), « Renommer »
  (1 à 80 caractères), « Retirer » (**seulement si la zone est vide** : « Videz la zone avant
  de la retirer »), « Ajouter une zone », « Remettre une zone de la trame ».
- La **duplication** d'une visite reprend la liste des zones (clés, libellés, ordre) avec un
  contenu vide.

## Puces

Le texte est du texte brut, jamais du HTML. À l'affichage (aperçu, lecture seule, futur PDF),
`parseNoteContent` (`src/lib/notes/format.ts`) le découpe en paragraphes et listes :

| Saisie                                                   | Rendu                                                     |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `Étanchéité correcte.`<br>`Deux lanterneaux à nettoyer.` | un paragraphe de deux lignes                              |
| `- Lanterneau 3`<br>`- Lanterneau 7`                     | une liste de deux puces                                   |
| `• Point` ou `* Point`, avec des espaces en tête         | une puce                                                  |
| `-5 °C ce matin`, `--`, `-texte`                         | du texte (pas d'espace après le tiret, donc pas une puce) |
| une ligne vide                                           | sépare deux paragraphes                                   |
| espaces de fin, lignes vides répétées, `\r\n` (Windows)  | normalisés                                                |

Le bouton **« Puce »** de la barre d'outils insère `- ` au début de la ligne courante, ou de
chaque ligne sélectionnée (celles qui en ont déjà une ne changent pas). La bascule **« Saisie /
Aperçu du rapport »** montre le rendu avec `NoteContent`.

## Enregistrement automatique et nouvelles tentatives

- Chaque zone s'enregistre **800 ms** après la dernière frappe, au `blur`, et dès qu'on
  change de zone (l'enregistrement de la zone quittée part immédiatement).
- Indicateur : « Enregistrement… », « Enregistré à 14:32 », « Hors connexion : nouvelle
  tentative… », « Erreur, réessayer ». La liste des zones montre aussi l'état d'une zone en
  cours d'enregistrement ou en échec.
- **Aucun texte n'est perdu** : en cas d'échec réseau ou d'erreur serveur, le texte reste dans
  l'éditeur et une nouvelle tentative a lieu après 1 s, 2 s, 5 s, 10 s, puis toutes les 30 s
  (`src/lib/notes/saver.ts`, testé avec une horloge simulée). Un refus (droits, validation)
  n'est pas réessayé : il s'affiche avec un bouton « Réessayer ».
- Tant qu'un enregistrement est en attente, le navigateur avertit avant de quitter la page
  (`beforeunload`) ; le passage en arrière-plan déclenche un enregistrement immédiat.
- 20 000 caractères maximum par zone (contrainte en base et `maxLength` côté client) ; un
  compteur apparaît à partir de 18 000.
- Pas de stockage local persistant : le vrai hors-ligne arrive en phase 2.

## Conflits par zone

Deux niveaux de version (migration 12, voir `docs/data-model.md`) :

- `visit_zone_notes.version` suit le **contenu** d'une note. Deux personnes peuvent écrire dans
  **deux zones différentes** de la même visite sans se gêner, et saisir du texte n'invalide pas
  le formulaire d'informations ouvert ailleurs.
- `visits.version` suit la **structure** (ajout, retrait, libellé, ordre), comme les
  participants. Ces opérations envoient la version de la visite ; en cas de conflit, le message
  de l'étape 5 s'affiche avec « Recharger ».

Quand deux personnes modifient la **même zone**, le second enregistrement est refusé et un
dialogue s'ouvre : « {nom} a modifié cette zone à {heure} », avec sa version (mise en forme)
et votre texte. Rien n'est enregistré sans votre choix :

- **Garder ma version** réenregistre votre texte sur la nouvelle version ;
- **Prendre la sienne** remplace l'éditeur par sa version et copie votre texte dans le
  presse-papiers quand le navigateur le permet (toast « Votre texte a été copié »).

« Modifié par {nom} à {heure} » apparaît sous l'éditeur quand la dernière modification vient
de quelqu'un d'autre.

## Lecture seule

La direction, un RT non concerné et toute personne sur une visite terminée voient la liste des
zones et le contenu mis en forme (`NoteContent`). Les zones vides affichent « Aucune
observation ». Il n'y a ni éditeur ni gestion des zones ; le bandeau de lecture seule de
l'étape 5 reste affiché. Un `updateContent` appelé directement est refusé par la RLS
(`can_edit_visit`).

## Points incomplets et compteurs

« Aucune observation saisie » rejoint l'encadré « À compléter » quand toutes les zones sont
vides, sans bloquer, y compris dans le dialogue « Terminer la visite ». Les cartes de la liste
et l'en-tête de la visite affichent « n/N zones renseignées », calculé à la lecture
(`visit_summaries.zones_count`, `filled_zones_count`), jamais stocké.

## Phase 2 (non codé)

- Une trame par motif de visite (la trame « réunion » actuelle est provisoire).
- Saisie hors réseau avec stockage local et synchronisation ; les versions par note et par
  visite sont déjà prêtes pour la réconciliation.
