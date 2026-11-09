-- Migration 21 : synchronisation hors réseau (étape 12).
--
--   1. sync_operations : idempotence de POST /api/sync. Une opération (op_id généré sur la
--      tablette) déjà appliquée pour cet utilisateur renvoie son résultat d'origine au lieu
--      d'être rejouée (une mise à jour rejouée produirait un faux conflit de version). Table
--      du service uniquement : aucune politique, aucun droit pour les utilisateurs connectés.
--   2. private.purge_sync_operations(interval) : entrées de plus de 30 jours, appelée par la
--      tâche nocturne existante (/api/cron/purge).
--
-- Les identifiants fournis par le client (UUID v7) n'ont besoin d'aucune modification : toutes
-- les tables ont `id uuid primary key default gen_random_uuid()` et aucune politique
-- d'insertion ne dépend de l'identifiant. Aucune colonne client_updated_at : l'arbitrage
-- repose sur les versions, jamais sur l'horloge d'une tablette.

create table if not exists public.sync_operations (
  user_id uuid not null references public.profiles (id) on delete restrict,
  op_id uuid not null,
  applied_at timestamptz not null default now(),
  result jsonb not null default '{}'::jsonb,
  primary key (user_id, op_id)
);

comment on table public.sync_operations is
  'Opérations de synchronisation hors réseau déjà appliquées (idempotence de POST /api/sync). Service uniquement, purgées après 30 jours.';
comment on column public.sync_operations.op_id is 'Identifiant de l''opération, généré sur l''appareil (UUID v7).';
comment on column public.sync_operations.result is 'Résultat renvoyé à l''appareil, rejoué tel quel si l''opération est renvoyée.';

create index if not exists sync_operations_applied_at_idx on public.sync_operations (applied_at);

alter table public.sync_operations enable row level security;
revoke all on public.sync_operations from anon, authenticated;
grant select, insert, delete on public.sync_operations to service_role;

create or replace function private.purge_sync_operations(max_age interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.sync_operations where applied_at < now() - max_age;
  get diagnostics removed = row_count;
  return removed;
end
$$;
comment on function private.purge_sync_operations(interval) is
  'Supprime les opérations de synchronisation appliquées depuis plus de max_age (30 jours par défaut). Service uniquement.';
revoke execute on function private.purge_sync_operations(interval) from public, anon, authenticated;
grant execute on function private.purge_sync_operations(interval) to service_role;
