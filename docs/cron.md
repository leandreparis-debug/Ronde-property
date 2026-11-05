# Tâches planifiées

## Purge nocturne des envois abandonnés

| Élément       | Valeur                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Route         | `GET /api/cron/purge` (`src/app/api/cron/purge/route.ts`)                                                                  |
| Planification | `vercel.json` : `0 2 * * *` (UTC)                                                                                          |
| Heure         | **3 h à Paris en hiver** (UTC+1) ; 4 h en été (UTC+2) : Vercel Cron ne connaît que l'UTC                                   |
| Accès         | en-tête `Authorization: Bearer <CRON_SECRET>` (envoyé par Vercel), sinon **401**                                           |
| Travail       | `withSystem('cron.purge')` : photos, plans et rapports `pending` de plus de 24 h, puis leurs fichiers par `StorageService` |
| Trace         | audit `system.purge` (nombre de photos, plans, rapports) ; journal `cron.purge.done`                                       |

Une ligne `pending` naît quand un envoi commence (photo, plan, rapport) et passe à `ready` à la
confirmation. Si l'onglet est fermé ou le réseau perdu entre les deux, la ligne et l'éventuel
fichier restent : la purge les retire. Les purges **opportunistes** (au plus une fois par minute à
l'ouverture des onglets Photos, Plans et Rapport) restent en place ; elles couvrent la V2 tant
qu'aucun planificateur n'est installé (voir `docs/migration-serveur-interne.md`).

Le comparatif du secret se fait en temps constant ; un utilisateur connecté, même admin, reçoit
aussi 401 : la route ne dépend d'aucune session (exception assumée à la règle 17).

## Mise en place (Léandre, Vercel)

1. Générer un secret de 48 caractères, dans PowerShell :

   ```powershell
   -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
   ```

2. Vercel → projet RONDE → Settings → Environment Variables : ajouter `CRON_SECRET` (valeur
   ci-dessus) pour **Production** uniquement, puis redéployer.
3. Vercel → projet → Settings → Cron Jobs : la tâche `/api/cron/purge` apparaît après le
   déploiement de `vercel.json` ; le bouton « Run » permet un premier essai.
4. Vérifier : Logs du déploiement, filtrer sur `cron.purge.done` ; dans RONDE, `/admin/journal`
   affiche « Purge planifiée ».

Essai manuel depuis PowerShell (remplacer l'URL et le secret) :

```powershell
Invoke-RestMethod -Uri "https://<domaine-ronde>/api/cron/purge" -Headers @{ Authorization = "Bearer <CRON_SECRET>" }
```

Sans en-tête, la même commande doit répondre `401`.

## Tests

- `tests/server/cron/auth.test.ts` : en-tête exact, secret absent ou trop court.
- `tests/integration/cron-purge.test.ts` : lignes anciennes et fichiers supprimés, lignes
  récentes gardées, audit.
- `e2e/cron.spec.ts` : 401 sans secret (même connecté), 200 avec.
