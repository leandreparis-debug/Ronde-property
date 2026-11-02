# Importer le référentiel des sites depuis VIGIE

Guide écrit pour Léandre. Les sites de RONDE viennent de **VIGIE**, l'outil entrepôts du groupe,
qui porte le même code entrepôt. VIGIE n'est pas joignable depuis Vercel : l'admin importe un
**export CSV**. RONDE ne modifie jamais un site à la main et n'en supprime jamais.

## 1. Produire l'export depuis VIGIE

Exportez la liste des entrepôts en CSV (ou enregistrez l'export Excel « CSV (séparateur :
point-virgule) »). Le fichier doit contenir une ligne d'en-tête. Les intitulés sont reconnus
sans tenir compte de la casse, des accents ni de la ponctuation :

| Champ RONDE          | Obligatoire | Intitulés reconnus (exemples)                                             |
| -------------------- | ----------- | ------------------------------------------------------------------------- |
| Code entrepôt        | **oui**     | Code entrepôt, Code entrepot, Code site, Code, Code VIGIE, warehouse_code |
| Nom                  | **oui**     | Nom, Nom du site, Nom entrepôt, Site, Libellé, name                       |
| Adresse              | non         | Adresse, Adresse postale, Rue, address                                    |
| Code postal          | non         | Code postal, CP, postal_code                                              |
| Ville                | non         | Ville, Commune, city                                                      |
| Surface (m²)         | non         | Surface, Surface (m²), Surface m2, SHON, Surface totale, surface_m2       |
| Catégorie            | non         | Catégorie, Type, Typologie, category                                      |
| Latitude / Longitude | non         | Latitude, Lat / Longitude, Lon, Lng, Long                                 |
| Actif                | non         | Actif, Statut, Active, État : `oui`/`non`, `1`/`0`, `actif`/`inactif`     |

Les colonnes inconnues sont ignorées et listées dans le rapport. Les alias sont dans
`src/server/sites/import/format.ts` (constante `FIELD_ALIASES`) : envoyez les vrais intitulés
de VIGIE pour les ajuster.

Formats acceptés : `.csv` ou `.txt`, 5 Mo et 5 000 lignes maximum ; séparateur `;` ou `,`
(détecté) ; encodage UTF-8 (avec ou sans BOM) ou Windows-1252 (Excel), détecté et indiqué dans
le rapport ; nombres `12 500,50` ou `12500.50`. Les codes sont mis en majuscules ; un code
postal à 4 chiffres (zéro perdu par Excel) est corrigé (`1000` → `01000`).

Un exemple fictif est fourni : `docs/samples/sites-vigie-exemple.csv` (15 lignes, `;`,
Windows-1252, avec volontairement un doublon, un code vide, un code postal à 4 chiffres, une
surface `12 500,50` et une colonne inconnue).

## 2. Simuler, puis appliquer

Menu **Administration → Import des sites** :

1. Déposez le fichier (bouton ou glisser-déposer) et choisissez les options.
2. **Simuler l'import** : rien n'est écrit. Le rapport donne les compteurs, le format détecté,
   les colonnes reconnues et ignorées, et le détail dépliable par catégorie.
3. **Appliquer l'import** : un dialogue récapitule les compteurs ; l'application écrit tout en
   **une seule transaction** et affiche le toast « Référentiel mis à jour ». En cas d'échec,
   rien n'est écrit.

L'application vérifie que le fichier (empreinte SHA-256) et le référentiel n'ont pas changé
depuis la simulation. Sinon, elle refuse avec « relancez la simulation ».

### Les catégories du rapport

| Catégorie      | Signification                                                                             |
| -------------- | ----------------------------------------------------------------------------------------- |
| Créations      | code inconnu de RONDE                                                                     |
| Mises à jour   | code connu avec au moins un champ différent (ancienne → nouvelle valeur)                  |
| Inchangés      | rien à modifier                                                                           |
| Réactivations  | site inactif présent dans le fichier                                                      |
| Désactivations | site marqué inactif dans le fichier, ou absent du fichier en mode référentiel complet     |
| Rejets         | ligne invalide (motif indiqué) ou code en double dans le fichier (toutes les occurrences) |

**Un rejet n'empêche pas d'appliquer le reste du fichier.**

### Les options

- **Ce fichier contient tout le référentiel** : les sites actifs absents du fichier sont
  **désactivés** (jamais supprimés). Décochée, aucun site n'est désactivé par absence : c'est
  le mode à utiliser pour un export partiel.
- **Une cellule vide efface la valeur existante** : décochée (par défaut), une cellule vide
  conserve la valeur déjà enregistrée ; le rapport indique combien de valeurs ont été
  conservées.

### Le garde-fou des 20 %

En mode référentiel complet, si le fichier désactiverait **plus de 20 %** des sites actifs,
l'application est bloquée tant que vous ne cochez pas « Je confirme la désactivation massive ».
C'est le signe le plus fréquent d'un export incomplet.

## 3. Historique

**Administration → Historique des imports** liste chaque simulation et chaque application :
date, auteur, fichier, compteurs, empreinte et rejets. Le fichier lui-même n'est **pas**
conservé, seule son empreinte l'est. Chaque application est aussi tracée dans le journal
d'audit (`site_import.applied`).

## 4. Ce qui n'est jamais fait

- Supprimer un site : un site disparu de VIGIE est désactivé et reste consultable avec ses visites.
- Modifier un site à la main dans RONDE : le référentiel ne change que par import.
- Interpréter une formule : une cellule commençant par `=`, `+`, `-` ou `@` est stockée telle
  quelle, jamais exécutée.
