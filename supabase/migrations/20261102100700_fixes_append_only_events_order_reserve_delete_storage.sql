-- Étape 2 · migration 8 : corrections révélées par la suite de tests (les migrations 1 à 7
-- restent intactes, conformément à la règle du projet).
--
--   1. truncate refusé sur audit_log et reserve_events (les triggers de ligne ne le couvraient pas) ;
--   2. reserve_events.seq : ordre stable des événements d'une même transaction ;
--   3. soft_delete_reserve : la suppression logique d'une réserve passe par une RPC, car la
--      politique select (hors supprimées) empêche un RT de produire une ligne qu'il ne peut
--      plus voir par un simple update ;
--   4. politiques storage « site-plans » : le nom d'objet doit être qualifié (objects.name),
--      sinon il désignait sites.name dans la sous-requête.

-- 1. Garde truncate.
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function private.reject_append_only_change();

drop trigger if exists reserve_events_no_truncate on public.reserve_events;
create trigger reserve_events_no_truncate
  before truncate on public.reserve_events
  for each statement execute function private.reject_append_only_change();

-- 2. Ordre des événements.
alter table public.reserve_events
  add column if not exists seq bigint generated always as identity;
comment on column public.reserve_events.seq is 'Ordre strict des événements, y compris au sein d''une même transaction.';
create index if not exists reserve_events_reserve_seq_idx on public.reserve_events (reserve_id, seq);

-- 3. Suppression logique d'une réserve par RPC ; deleted_* réservés à la RPC.
create or replace function private.reserves_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visit_id <> old.visit_id or new.site_id <> old.site_id or new.number <> old.number then
    raise exception 'La visite, le site et le numéro d''une réserve sont immuables.' using errcode = '42501';
  end if;
  if (new.deleted_at, new.deleted_by) is distinct from (old.deleted_at, old.deleted_by)
     and coalesce(current_setting('ronde.rpc', true), '') <> '1'
     and current_user <> 'postgres'
  then
    raise exception 'La suppression d''une réserve passe par soft_delete_reserve.' using errcode = '42501';
  end if;
  if new.status = 'done' and old.status <> 'done' then
    new.closed_at := now();
    new.closed_by := auth.uid();
  elsif new.status <> 'done' then
    new.closed_at := null;
    new.closed_by := null;
  end if;
  return new;
end
$$;

create or replace function public.soft_delete_reserve(reserve_id uuid)
returns public.reserves
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.reserves;
begin
  select * into target from public.reserves r where r.id = reserve_id;
  if target.id is null or target.deleted_at is not null or not private.can_edit_visit(target.visit_id) then
    raise exception 'Suppression refusée : la réserve n''existe pas, est déjà supprimée ou sa visite n''est pas modifiable.'
      using errcode = '42501';
  end if;

  perform set_config('ronde.rpc', '1', true);
  update public.reserves
  set deleted_at = now(), deleted_by = auth.uid()
  where id = reserve_id
  returning * into target;
  perform set_config('ronde.rpc', '', true);

  return target;
end
$$;
comment on function public.soft_delete_reserve(uuid) is 'Suppression logique d''une réserve, si sa visite est modifiable. Tracée par trigger (reserve_events, audit_log).';
revoke execute on function public.soft_delete_reserve(uuid) from public, anon;
grant execute on function public.soft_delete_reserve(uuid) to authenticated, service_role;

-- 4. Politiques storage « site-plans » avec le nom d'objet qualifié.
drop policy if exists site_plans_select on storage.objects;
create policy site_plans_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'site-plans'
    and private.is_active_user()
    and exists (select 1 from public.sites s where s.id = private.storage_root_id(objects.name))
  );
drop policy if exists site_plans_insert on storage.objects;
create policy site_plans_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'site-plans'
    and private.is_rt_or_admin()
    and exists (select 1 from public.sites s where s.id = private.storage_root_id(objects.name))
  );
