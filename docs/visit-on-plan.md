# Mener la visite depuis le plan (étape 12 b)

Depuis l'étape 12 b, l'écran principal d'une visite est **« Plan »** : le RT marche sur le site
avec la tablette et saisit ce qu'il voit **à l'endroit où il le voit**. Les anciens onglets
(Informations, Notes, Réserves, Photos) sont regroupés sous **« Liste »**, sans changement de
contenu ; **« Rapport »** reste à part.

Code : `src/components/visits/plan-screen/` (écran et feuilles), `src/lib/plans/visit-plan.ts`
(logique pure : vues affichées, compteurs, emplacement, fil, mémoire du zoom, anciens liens) et
`src/lib/plans/structure.ts` (bâtiments, contours, ordre, titres, `resolveZone`).

## Principe

- Le plan d'un site se configure **une fois**, en ligne, sur la page du site (« Bâtiments et
  étages ») : chaque page d'un plan importé devient la **vue extérieure**, un **étage** d'un
  bâtiment, ou n'est pas utilisée (`docs/plans.md`).
- Pendant la visite, on se déplace de la vue extérieure à un bâtiment puis à un étage ; un toucher
  court sur le plan propose **Photo**, **Réserve** ou **Note** à cet endroit.
- Tout ce qui se fait pendant la visite fonctionne **hors réseau** (file d'envoi,
  `docs/offline.md`) : la structure du site, ses contours et ses images font partie de la copie
  locale de la visite.

## Vues, bâtiments, étages

| Notion         | Table / type                   | Ce que c'est                                                                   |
| -------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| Vue            | `site_views` / `SiteViewView`  | une page d'un plan du site affectée à la vue extérieure ou à un étage          |
| Vue extérieure | `site_views.kind = 'exterior'` | au plus une active par site ; porte les contours des bâtiments                 |
| Bâtiment       | `site_buildings`               | nom, ordre, contour facultatif (3 à 24 points relatifs) sur la vue extérieure  |
| Étage          | `site_views.kind = 'level'`    | libellé (RDC, R+1, Sous-sol, Toiture, Mezzanine ou libre), du bas vers le haut |

Une **vue est une page de plan affectée** : les repères restent rattachés à `(plan_id, page)`
comme depuis l'étape 8, la vue d'un repère se retrouve par sa page (`viewIdOfMarker`). Remplacer
l'image d'un étage archive l'ancienne vue (`replaced_by`) et en crée une nouvelle : les repères
des visites passées restent sur l'ancienne image, une nouvelle visite utilise la nouvelle. Une
vue archivée qui porte des repères de la visite reste visible avec le badge « Archivée » (ou
« Ancienne image »), sans nouveau repère.

### Navigation

- À l'ouverture : la vue de l'URL (`?vue=`), sinon la **vue extérieure**, sinon l'unique étage
  du seul bâtiment, sinon la **liste des bâtiments** (cartes avec la miniature du premier étage
  et le nombre de saisies) — `initialLocation`.
- Vue extérieure : les contours sont dessinés et touchables, avec le nom du bâtiment et un
  badge du nombre de saisies ; deux contours qui se chevauchent : **le plus petit gagne**
  (`buildingAt`). Un bâtiment sans contour reste accessible par « Tous les bâtiments ».
- Entrer dans un bâtiment ouvre **le dernier étage consulté pendant la visite**, sinon le premier
  (`entryLevel`, mémoire de session).
- Étage : onglets des étages avec leur compteur ; fil d'Ariane « Vue extérieure › Bâtiment B ›
  R+1 », chaque étape touchable ; pas de fil d'Ariane s'il n'y a qu'une vue.
- `?vue=` vaut l'identifiant de la vue, `batiments` ou `batiment-<id>` ; le zoom et la position
  de chaque vue sont gardés pendant la visite (`createViewMemory`, `sessionStorage`).
- Les images des vues voisines (étage du dessous, du dessus, vue extérieure) sont préchargées :
  changer d'étage avec l'image en cache prend moins de 300 ms (mesuré par C8).
- Anciens liens : `?onglet=plans&plan=…&page=…&repere=…` ouvre la vue de cette page et centre
  le repère ; `?onglet=photos` ouvre « Liste » sur Photos (`screenOfTab`).

## Gestes

| Geste                                              | Effet                                                        |
| -------------------------------------------------- | ------------------------------------------------------------ |
| toucher court (un doigt, < 10 px, < 600 ms)        | menu rapide au point touché (ou entrée dans un bâtiment)     |
| glisser un doigt                                   | déplace le plan, ferme le menu                               |
| pincer                                             | zoome ; jamais de menu, même si un doigt est levé en premier |
| toucher un repère                                  | sa feuille (photo, réserve ou note)                          |
| souris : clic, glisser, molette, glisser un repère | les mêmes, plus le déplacement direct d'un repère            |

**Jamais de repère sans choix dans le menu** : le mode « Placer un repère » a disparu.

## Menu rapide

Trois boutons de 56 px dessinés **au-dessus du point** (en dessous près du bord haut, toujours
dans le plan, `quickMenuPosition`), le point marqué d'une cible. Un toucher ailleurs, Échap ou un
déplacement du plan le ferment.

- **Photo** : ouvre l'appareil (`capture="environment"`). La photo est compressée sur la tablette
  (étape 7), puis le repère « photo » est créé au point, lié à la photo, et une feuille légère
  s'ouvre : légende facultative, zone préremplie, « En faire une réserve » (feuille de réserve
  avec la photo et le repère déjà liés). Appareil annulé : rien n'est créé.
- **Réserve** : la feuille de réserve de l'étape 9 ; à l'enregistrement, son repère est placé au
  point (`reserve.place`). « Prendre une photo » y reste disponible.
- **Note** : un texte de 500 caractères au plus, gardé comme repère `kind = 'note'` (épingle jaune
  « ✎ »). Une note n'est jamais un « repère sans photo ».

La **zone** proposée est celle de `resolveZone(viewId, x, y)` puis, à défaut, la dernière zone
utilisée sur cette vue (sélecteur « Zone » sous le plan), sinon aucune.

## Déclencheur et « À ranger »

Le **déclencheur** (bouton rond de 64 px, en bas, côté pouce) prend une photo sans chercher
l'endroit : elle part dans **« À ranger »** (`photos.to_sort`) avec la vue affichée comme indice
(`photos.hint_view_id`). Le badge compte les photos à ranger ; le tiroir propose pour chacune :

- **Placer** : la vue de l'indice s'ouvre, le toucher suivant place la photo (repère + sortie
  d'« À ranger ») ;
- **Sans emplacement** : elle quitte « À ranger » et reste dans les photos de la visite (annexe
  du rapport si elle n'a ni zone, ni réserve, ni repère) ;
- **En faire une réserve** : feuille de réserve avec la photo comme photo du défaut.

Le point incomplet « N photos à ranger » ouvre ce tiroir (`?onglet=plans&a-ranger=1`).

## Fil de visite

Bandeau repliable sous le plan : les 20 dernières saisies de la visite, toutes vues confondues
(« R-? · Fuite · Bât. B R+1 », « Note · … », « Photo 3 · … », « Photo à ranger ») — `visitFeed`.
Un toucher va sur la vue et centre le repère. **« Annuler »** défait la dernière saisie faite sur
cet écran pendant 10 secondes (repère et photo, note, réserve).

La **légende** (types de repères, « Masquer les levées », partagé avec la liste des réserves) et
l'indicateur de synchronisation restent visibles sans masquer le fil d'Ariane.

## Gaucher et une seule main

Les commandes principales (déclencheur, « À ranger ») sont dans le tiers bas, côté pouce : fixes
au-dessus de la barre du bas sur tablette, dans le coin du plan sur ordinateur. L'option
**« Gaucher »** du menu du compte (par appareil, `localStorage`) les passe à gauche et met le zoom
à droite (`thumbSide`). Le plan remonte sous la barre du haut dès qu'on s'y déplace, pour tenir
dans l'écran en portrait (768 × 1024) comme en paysage (1024 × 768).

## Lecture seule

Direction, RT non concerné, visite terminée : même navigation, compteurs et fil, mais ni menu,
ni déclencheur, ni modification ; un repère ouvre sa feuille en lecture. Sans plan configuré, la
direction ouvre la visite sur « Liste » ; un RT ou un admin voit « Importer un plan » (ou
« Affecter les pages »), qui mène à la page du site.

## Hors réseau

- La copie locale (`VisitSnapshot`, Dexie version 2) contient `buildings` et `views` ; « Garder
  hors réseau » télécharge déjà toutes les pages des plans actifs, donc les images de toutes les
  vues.
- Les écritures passent par `useVisitMutations` : `marker.create` (avec `kind`, `photoId`,
  identifiant choisi par l'appareil pour ouvrir la feuille aussitôt), `photo.create` (`toSort`,
  `hintViewId`), `photo.update` (`toSort`), `reserve.place`, `reserve.attachMarker`,
  `marker.move`, `marker.delete`. Une photo prise hors réseau puis placée part avant son repère
  (dépendance par `photoId`).

## Point d'extension : les zones sur les étages

`resolveZone(viewId, x, y)` renvoie `null` aujourd'hui. Quand les zones de la trame seront
tracées sur les étages (étape ultérieure, même principe que les contours), elle renverra la clé
de la zone qui contient le point et les feuilles la prérempliront sans autre changement.
