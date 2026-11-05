# Polices de RONDE (licence SIL Open Font License 1.1)

Aucune police n'est téléchargée depuis Google ou un CDN, ni au build ni à l'exécution.

| Dossier   | Fichiers                                                                                                      | Usage                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `web/`    | `BricolageGrotesque-Bold.woff2` (700), `InstrumentSans-Variable.woff2` (400 à 700), `Caveat-Bold.woff2` (700) | interface, chargées par `next/font/local` (`src/app/layout.tsx`) |
| `report/` | TTF statiques Bricolage Grotesque 600/700, Instrument Sans 400/600/italique                                   | rapport PDF (`@react-pdf/renderer`)                              |

Les woff2 de `web/` viennent des fichiers du projet google/fonts : Bricolage et Caveat sont les
instances statiques 700 servies par Google Fonts ; Instrument Sans est l'instance variable
(graisse 400 à 700, largeur 100). Toutes sont réduites au latin et au latin étendu
(`pyftsubset`, fontTools 4.68, woff2). Les licences sont à côté des fichiers.
