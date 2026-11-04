-- Étape 9 · migration 16 : réserves modifiables en concurrence optimiste, placées sur le plan.
--
--   1. reserves.version : incrémentée à chaque mise à jour (concurrence optimiste, comme visits) ;
--      l'historique (reserve_events) ignore ce champ technique ;
--   2. responsable optionnel : responsible_kind devient nullable (« À désigner ») ; quand il est
--      renseigné, la cohérence interne / externe reste vérifiée ;
--   3. plan_markers.reserve_id : une réserve a au plus un repère, de la même visite, non
--      supprimée ; la suppression logique d'une réserve supprime son repère dans
--      soft_delete_reserve (même transaction) ;
--   4. reserve_photos : la photo appartient à la même visite que la réserve ; seul le type
--      `defect` est accepté (`proof` est réservé à l'étape 13, qui l'ouvrira par migration) ;
--   5. reserves_with_state recréée avec des colonnes explicites et les champs d'affichage :
--      photos, première miniature, repère, nom du responsable interne, days_overdue ;
--   6. index des listes : réserves non supprimées par visite, réserves non levées par site.

-- ---------------------------------------------------------------------------
-- 1. version
-- ---------------------------------------------------------------------------
alter table public.reserves add column if not exists version integer not null default 1 check (version >= 1);
comment on column public.reserves.version is
  'Version pour la concurrence optimiste : incrémentée par trigger à chaque mise à jour.';

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
  new.version := old.version + 1;
  return new;
end
$$;

-- L'historique ignore version (technique) en plus des champs déjà ignorés.
create or replace function private.reserves_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  diff jsonb;
begin
  if tg_op = 'INSERT' then
    perform private.record_reserve_event(new.id, 'created', null, new.status,
      jsonb_build_object('action', new.action, 'priority', new.priority, 'due_date', new.due_date));
    perform private.audit('reserve.created', 'reserve', new.id,
      jsonb_build_object('visit_id', new.visit_id, 'number', new.number, 'action', new.action));
    return new;
  end if;

  diff := private.jsonb_diff(
    to_jsonb(old), to_jsonb(new),
    array['updated_at', 'closed_at', 'closed_by', 'deleted_by', 'version']
  );

  if new.deleted_at is not null and old.deleted_at is null then
    perform private.record_reserve_event(new.id, 'deleted', old.status, new.status, diff);
    perform private.audit('reserve.deleted', 'reserve', new.id, jsonb_build_object('number', new.number));
  elsif new.status is distinct from old.status then
    perform private.record_reserve_event(new.id, 'status_changed', old.status, new.status, diff);
    perform private.audit('reserve.status_changed', 'reserve', new.id,
      jsonb_build_object('from', old.status, 'to', new.status));
  elsif diff <> '{}'::jsonb then
    perform private.record_reserve_event(new.id, 'updated', old.status, new.status, diff);
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Responsable optionnel
-- ---------------------------------------------------------------------------
alter table public.reserves alter column responsible_kind drop not null;
alter table public.reserves alter column responsible_kind drop default;
alter table public.reserves drop constraint if exists reserves_responsible_consistency;
-- Conditions écrites sans NULL possible (coalesce) : une contrainte CHECK qui s'évalue à NULL
-- est acceptée par PostgreSQL, ce qui laisserait passer un nom sans type de responsable.
alter table public.reserves add constraint reserves_responsible_consistency check (
  coalesce(
    (
      responsible_kind is null
      and responsible_profile_id is null
      and responsible_name is null
      and responsible_company is null
      and responsible_email is null
    )
    or (
      coalesce(responsible_kind::text, '') = 'internal'
      and responsible_profile_id is not null
      and responsible_name is null
      and responsible_company is null
      and responsible_email is null
    )
    or (
      coalesce(responsible_kind::text, '') = 'external'
      and responsible_profile_id is null
      and responsible_name is not null
      and char_length(btrim(responsible_name)) >= 1
    ),
    false
  )
);
comment on column public.reserves.responsible_kind is
  'internal (profil), external (nom, entreprise, e-mail facultatif) ou null : « À désigner ».';

-- ---------------------------------------------------------------------------
-- 3. Réserve placée sur le plan
-- ---------------------------------------------------------------------------
alter table public.plan_markers
  add column if not exists reserve_id uuid references public.reserves (id) on delete restrict;
comment on column public.plan_markers.reserve_id is
  'Réserve placée par ce repère (au plus un repère par réserve, de la même visite).';
create unique index if not exists plan_markers_reserve_unique_idx
  on public.plan_markers (reserve_id) where reserve_id is not null;

create or replace function private.plan_markers_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan record;
  visit_site uuid;
  reserve record;
begin
  select p.site_id, p.upload_status, p.is_archived into plan
  from public.site_plans p where p.id = new.plan_id;
  if plan is null then
    raise exception 'Plan introuvable.' using errcode = '23503';
  end if;
  select v.site_id into visit_site from public.visits v where v.id = new.visit_id;
  if visit_site is distinct from plan.site_id then
    raise exception 'Le plan n''appartient pas au site de la visite.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.site_plan_pages pp
    where pp.plan_id = new.plan_id and pp.page_number = new.page
  ) then
    raise exception 'Cette page n''existe pas dans le plan.' using errcode = '23514';
  end if;
  if new.photo_id is not null and not exists (
    select 1 from public.photos ph where ph.id = new.photo_id and ph.visit_id = new.visit_id
  ) then
    raise exception 'La photo liée doit appartenir à la même visite.' using errcode = '23514';
  end if;
  if new.reserve_id is not null
     and (tg_op = 'INSERT' or new.reserve_id is distinct from old.reserve_id) then
    select r.visit_id, r.deleted_at into reserve from public.reserves r where r.id = new.reserve_id;
    if reserve is null or reserve.visit_id <> new.visit_id then
      raise exception 'La réserve doit appartenir à la même visite que le repère.' using errcode = '23514';
    end if;
    if reserve.deleted_at is not null then
      raise exception 'Cette réserve est supprimée.' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'INSERT' then
    if plan.upload_status <> 'ready' then
      raise exception 'Le plan n''est pas encore disponible.' using errcode = '23514';
    end if;
    if plan.is_archived then
      raise exception 'Ce plan est archivé : aucun nouveau repère.' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

-- La suppression logique d'une réserve supprime son repère dans la même transaction.
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

  delete from public.plan_markers m where m.reserve_id = soft_delete_reserve.reserve_id;

  perform set_config('ronde.rpc', '1', true);
  update public.reserves
  set deleted_at = now(), deleted_by = auth.uid()
  where id = soft_delete_reserve.reserve_id
  returning * into target;
  perform set_config('ronde.rpc', '', true);

  return target;
end
$$;
comment on function public.soft_delete_reserve(uuid) is
  'Suppression logique d''une réserve, si sa visite est modifiable ; supprime son repère sur le plan. Tracée par trigger (reserve_events, audit_log).';

-- ---------------------------------------------------------------------------
-- 4. reserve_photos : même visite, defect uniquement à cette étape
-- ---------------------------------------------------------------------------
create or replace function private.reserve_photos_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind <> 'defect' then
    raise exception 'Seules les photos du défaut sont acceptées (la photo de preuve viendra plus tard).'
      using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.reserves r
    join public.photos ph on ph.visit_id = r.visit_id
    where r.id = new.reserve_id and ph.id = new.photo_id
  ) then
    raise exception 'La photo doit appartenir à la même visite que la réserve.' using errcode = '23514';
  end if;
  return new;
end
$$;
drop trigger if exists reserve_photos_check on public.reserve_photos;
create trigger reserve_photos_check before insert or update on public.reserve_photos
  for each row execute function private.reserve_photos_check();

-- ---------------------------------------------------------------------------
-- 5. Vue d'affichage
-- ---------------------------------------------------------------------------
drop view if exists public.reserves_with_state;
create view public.reserves_with_state
with (security_invoker = true)
as
select
  r.id,
  r.visit_id,
  r.site_id,
  r.number,
  r.action,
  r.description,
  r.zone_key,
  r.priority,
  r.responsible_kind,
  r.responsible_profile_id,
  r.responsible_name,
  r.responsible_company,
  r.responsible_email,
  r.due_date,
  r.status,
  r.closed_at,
  r.closed_by,
  r.created_by,
  r.deleted_at,
  r.deleted_by,
  r.created_at,
  r.updated_at,
  r.version,
  private.reserve_code(r.number) as code,
  private.is_reserve_overdue(r.due_date, r.status, now()) as is_overdue,
  case
    when private.is_reserve_overdue(r.due_date, r.status, now())
      then (private.paris_date(now()) - r.due_date)
    else 0
  end::integer as days_overdue,
  rp.full_name as responsible_display_name,
  rp.is_active as responsible_is_active,
  cb.full_name as closed_by_name,
  coalesce(ph.photos_count, 0)::integer as photos_count,
  ph.first_photo_id,
  ph.first_thumb_path,
  mk.id as marker_id,
  mk.plan_id as marker_plan_id,
  mk.page as marker_page
from public.reserves r
left join public.profiles rp on rp.id = r.responsible_profile_id
left join public.profiles cb on cb.id = r.closed_by
left join lateral (
  select
    count(*) as photos_count,
    (array_agg(p.id order by l.created_at, p.sort_order, p.id))[1] as first_photo_id,
    (array_agg(p.thumb_path order by l.created_at, p.sort_order, p.id))[1] as first_thumb_path
  from public.reserve_photos l
  join public.photos p on p.id = l.photo_id and p.upload_status = 'ready'
  where l.reserve_id = r.id and l.kind = 'defect'
) ph on true
left join public.plan_markers mk on mk.reserve_id = r.id;
comment on view public.reserves_with_state is
  'Réserves avec le code R-07, is_overdue et days_overdue (Europe/Paris), le nom du responsable interne, les photos du défaut (nombre, première miniature) et le repère sur le plan. RLS des tables sources appliquée.';
grant select on public.reserves_with_state to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Index des listes
-- ---------------------------------------------------------------------------
create index if not exists reserves_visit_active_idx
  on public.reserves (visit_id, number) where deleted_at is null;
create index if not exists reserves_site_open_idx
  on public.reserves (site_id, priority, due_date) where deleted_at is null and status <> 'done';
create index if not exists plan_markers_reserve_idx on public.plan_markers (reserve_id) where reserve_id is not null;
