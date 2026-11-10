-- Migration 22 (étape 12 b) : mener la visite depuis le plan.
--
--   1. site_buildings : bâtiments d'un site, avec un contour facultatif sur la vue extérieure
--      (polygone en coordonnées relatives, 3 à 24 points) ;
--   2. site_views : une vue est une page de plan affectée à un rôle, « exterior » (une seule
--      active par site) ou « level » (un étage d'un bâtiment) ; une page sert au plus une vue
--      active ; bâtiment, plan et vue sont du même site (trigger) ; une vue remplacée garde ses
--      repères (visites passées) et désigne celle qui la remplace ;
--   3. plan_markers.kind (« photo », « note ») et libellé jusqu'à 500 caractères pour une note ;
--   4. photos.to_sort et photos.hint_view_id : les photos « À ranger » prises au déclencheur ;
--   5. reprise de l'existant : un « Bâtiment principal » par site qui a des plans, et une vue
--      « level » par page de plan, dans l'ordre d'import ; aucune vue extérieure.

-- ---------------------------------------------------------------------------
-- 0. Contour : tableau de 3 à 24 points { "x": 0..1, "y": 0..1 }. Que le contour ne se croise
--    pas lui-même est vérifié par le serveur (message en français) ; la base garde la forme.
-- ---------------------------------------------------------------------------
create or replace function private.is_valid_outline(outline jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select outline is null or (
    jsonb_typeof(outline) = 'array'
    and jsonb_array_length(outline) between 3 and 24
    and not exists (
      select 1
      from jsonb_array_elements(outline) as point
      where jsonb_typeof(point) <> 'object'
        or jsonb_typeof(point -> 'x') <> 'number'
        or jsonb_typeof(point -> 'y') <> 'number'
        or (point ->> 'x')::numeric not between 0 and 1
        or (point ->> 'y')::numeric not between 0 and 1
    )
  )
$$;
grant execute on function private.is_valid_outline(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. site_buildings
-- ---------------------------------------------------------------------------
create table if not exists public.site_buildings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 60 and char_length(name) <= 60),
  sort_order integer not null default 0,
  outline jsonb check (private.is_valid_outline(outline)),
  is_archived boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.site_buildings is
  'Bâtiments d''un site (étape 12 b), avec leur contour facultatif sur la vue extérieure.';
comment on column public.site_buildings.outline is
  'Polygone en coordonnées relatives à l''image de la vue extérieure : [{"x":0..1,"y":0..1}], 3 à 24 points, null sans contour.';
create index if not exists site_buildings_site_idx on public.site_buildings (site_id, sort_order);

drop trigger if exists set_updated_at on public.site_buildings;
create trigger set_updated_at before update on public.site_buildings
  for each row execute function private.set_updated_at();

alter table public.site_buildings enable row level security;
revoke all on public.site_buildings from anon, authenticated;
grant select, insert, update on public.site_buildings to authenticated;
grant select, insert, update on public.site_buildings to service_role;

create policy site_buildings_select on public.site_buildings
  for select to authenticated using (private.is_active_user());
create policy site_buildings_insert on public.site_buildings
  for insert to authenticated with check (private.is_rt_or_admin());
create policy site_buildings_update on public.site_buildings
  for update to authenticated using (private.is_rt_or_admin()) with check (private.is_rt_or_admin());

-- ---------------------------------------------------------------------------
-- 2. site_views
-- ---------------------------------------------------------------------------
create table if not exists public.site_views (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete restrict,
  kind text not null check (kind in ('exterior', 'level')),
  building_id uuid references public.site_buildings (id) on delete restrict,
  label text not null check (char_length(btrim(label)) between 1 and 60 and char_length(label) <= 60),
  sort_order integer not null default 0,
  plan_id uuid not null,
  page_number integer not null check (page_number >= 1),
  replaced_by uuid references public.site_views (id) on delete set null,
  is_archived boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (plan_id, page_number)
    references public.site_plan_pages (plan_id, page_number) on delete restrict,
  constraint site_views_kind_building check (
    (kind = 'level' and building_id is not null) or (kind = 'exterior' and building_id is null)
  )
);
comment on table public.site_views is
  'Vues d''un site (étape 12 b) : une page de plan affectée à la vue extérieure ou à un étage d''un bâtiment.';
comment on column public.site_views.sort_order is 'Ordre des étages d''un bâtiment, du bas vers le haut.';
comment on column public.site_views.replaced_by is
  'Vue qui a remplacé celle-ci (nouvelle image d''un étage) : l''ancienne reste visible pour les visites qui y ont des repères.';

create unique index if not exists site_views_one_exterior_idx
  on public.site_views (site_id) where kind = 'exterior' and not is_archived;
create unique index if not exists site_views_page_idx
  on public.site_views (plan_id, page_number) where not is_archived;
create index if not exists site_views_site_idx on public.site_views (site_id, kind, sort_order);
create index if not exists site_views_building_idx on public.site_views (building_id, sort_order);

drop trigger if exists set_updated_at on public.site_views;
create trigger set_updated_at before update on public.site_views
  for each row execute function private.set_updated_at();

-- Bâtiment, plan et vue appartiennent au même site ; un bâtiment archivé ne reçoit pas de vue.
create or replace function private.site_views_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_site uuid;
  building record;
begin
  select p.site_id into plan_site from public.site_plans p where p.id = new.plan_id;
  if plan_site is distinct from new.site_id then
    raise exception 'Le plan n''appartient pas à ce site.' using errcode = '23514';
  end if;
  if new.building_id is not null then
    select b.site_id, b.is_archived into building
    from public.site_buildings b where b.id = new.building_id;
    if building.site_id is distinct from new.site_id then
      raise exception 'Le bâtiment n''appartient pas à ce site.' using errcode = '23514';
    end if;
    if building.is_archived and not new.is_archived
       and (tg_op = 'INSERT' or new.building_id is distinct from old.building_id) then
      raise exception 'Ce bâtiment est archivé.' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.site_id, new.plan_id, new.page_number)
     is distinct from (old.site_id, old.plan_id, old.page_number) then
    raise exception 'L''image d''une vue ne change pas : elle se remplace par une nouvelle vue.'
      using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists site_views_check on public.site_views;
create trigger site_views_check before insert or update on public.site_views
  for each row execute function private.site_views_check();

alter table public.site_views enable row level security;
revoke all on public.site_views from anon, authenticated;
grant select, insert, update on public.site_views to authenticated;
grant select, insert, update on public.site_views to service_role;

create policy site_views_select on public.site_views
  for select to authenticated using (private.is_active_user());
create policy site_views_insert on public.site_views
  for insert to authenticated with check (private.is_rt_or_admin());
create policy site_views_update on public.site_views
  for update to authenticated using (private.is_rt_or_admin()) with check (private.is_rt_or_admin());

-- Audit : création, renommage, contour, ordre, archivage.
create or replace function private.audit_site_structure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entity text := case when tg_table_name = 'site_buildings' then 'site_building' else 'site_view' end;
  title text := coalesce(to_jsonb(new) ->> 'name', to_jsonb(new) ->> 'label');
begin
  if tg_op = 'INSERT' then
    perform private.audit(entity || '.created', entity, new.id,
      jsonb_build_object('site_id', new.site_id, 'name', title));
    return new;
  end if;
  if new.is_archived is distinct from old.is_archived then
    perform private.audit(
      entity || case when new.is_archived then '.archived' else '.unarchived' end,
      entity, new.id, jsonb_build_object('site_id', new.site_id, 'name', title));
  elsif to_jsonb(new) - array['updated_at', 'sort_order'] is distinct from to_jsonb(old) - array['updated_at', 'sort_order'] then
    perform private.audit(entity || '.updated', entity, new.id,
      jsonb_build_object('site_id', new.site_id, 'name', title));
  end if;
  return new;
end
$$;
drop trigger if exists audit_site_buildings on public.site_buildings;
create trigger audit_site_buildings after insert or update on public.site_buildings
  for each row execute function private.audit_site_structure();
drop trigger if exists audit_site_views on public.site_views;
create trigger audit_site_views after insert or update on public.site_views
  for each row execute function private.audit_site_structure();

-- ---------------------------------------------------------------------------
-- 3. plan_markers : nature du repère, notes sur plan
-- ---------------------------------------------------------------------------
alter table public.plan_markers
  add column if not exists kind text not null default 'photo' check (kind in ('photo', 'note'));
comment on column public.plan_markers.kind is
  'photo : repère d''une photo (ou d''une réserve, portée par reserve_id) ; note : note sur plan (libellé obligatoire, 500 caractères).';
alter table public.plan_markers drop constraint if exists plan_markers_label_check;
alter table public.plan_markers add constraint plan_markers_label_check check (
  label is null or char_length(label) <= case when kind = 'note' then 500 else 200 end
);
alter table public.plan_markers add constraint plan_markers_note_check check (
  kind <> 'note' or (label is not null and char_length(btrim(label)) >= 1 and reserve_id is null)
);

-- ---------------------------------------------------------------------------
-- 4. photos « À ranger »
-- ---------------------------------------------------------------------------
alter table public.photos
  add column if not exists to_sort boolean not null default false,
  add column if not exists hint_view_id uuid references public.site_views (id) on delete set null;
comment on column public.photos.to_sort is
  'Photo prise au déclencheur, pas encore rangée : « Placer », « Sans emplacement » ou « En faire une réserve ».';
comment on column public.photos.hint_view_id is 'Vue affichée au moment de la prise : indice pour la ranger.';
create index if not exists photos_to_sort_idx on public.photos (visit_id) where to_sort;

-- ---------------------------------------------------------------------------
-- 5. Reprise de l'existant : un « Bâtiment principal » par site qui a des plans prêts, une vue
--    « level » par page, dans l'ordre d'import (plan, puis page). Les pages d'un plan archivé
--    donnent des vues archivées. Aucune vue extérieure.
-- ---------------------------------------------------------------------------
create or replace function private.backfill_site_views()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  created integer := 0;
  site record;
  building_id uuid;
begin
  for site in
    select distinct p.site_id
    from public.site_plans p
    where p.upload_status = 'ready'
      and not exists (select 1 from public.site_buildings b where b.site_id = p.site_id)
  loop
    insert into public.site_buildings (site_id, name, sort_order, created_by)
    values (site.site_id, 'Bâtiment principal', 0, null)
    returning id into building_id;

    insert into public.site_views
      (site_id, kind, building_id, label, sort_order, plan_id, page_number, is_archived, created_by)
    select
      p.site_id,
      'level',
      building_id,
      case
        when p.page_count > 1 then left(p.name, 52) || ' · p. ' || pp.page_number
        else left(p.name, 60)
      end,
      (row_number() over (order by p.created_at, p.id, pp.page_number))::integer - 1,
      p.id,
      pp.page_number,
      p.is_archived,
      null
    from public.site_plans p
    join public.site_plan_pages pp on pp.plan_id = p.id
    where p.site_id = site.site_id and p.upload_status = 'ready';
    created := created + 1;
  end loop;
  return created;
end
$$;
comment on function private.backfill_site_views() is
  'Reprise de l''étape 12 b : un « Bâtiment principal » et ses étages pour chaque site qui a des plans prêts et aucun bâtiment. Renvoie le nombre de bâtiments créés.';
revoke execute on function private.backfill_site_views() from public, anon, authenticated;
grant execute on function private.backfill_site_views() to service_role;

select private.backfill_site_views();
