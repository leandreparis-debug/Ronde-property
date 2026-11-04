-- Étape 8 · migration 15 : plans convertis en images de pages, repères contrôlés.
--
--   1. site_plans.upload_status : `pending` à la création (preuve d'autorisation avant toute URL
--      signée), `ready` une fois l'original et toutes les pages vérifiés. Seuls les plans `ready`
--      sont visibles des autres utilisateurs ; l'auteur voit le sien en attente ;
--   2. site_plan_pages : une image d'affichage (3 500 px) et une miniature (400 px) par page,
--      figées une fois le plan `ready` ;
--   3. plan_markers : la page existe, la photo liée appartient à la même visite, le plan est
--      rattaché au même site que la visite, prêt et non archivé (nouveaux repères) ;
--   4. audit `site_plan.imported` à la confirmation, plus à l'insertion de la ligne pending ;
--   5. private.purge_stale_pending_plans(interval) : plans pending de plus de 24 h et leurs
--      chemins (original, images, miniatures) pour que le service efface les objets.

-- ---------------------------------------------------------------------------
-- 1. site_plans.upload_status
-- ---------------------------------------------------------------------------
alter table public.site_plans
  add column if not exists upload_status text not null default 'pending'
    check (upload_status in ('pending', 'ready'));
comment on column public.site_plans.upload_status is
  'pending : ligne créée avant l''envoi (URL signées délivrées) ; ready : original et pages vérifiés.';
comment on column public.site_plans.storage_path is
  'Chemin de l''original dans le bucket site-plans : {site_id}/{plan_id}/original.{pdf|png|jpg}.';

-- Les plans antérieurs à cette migration ont été créés avec leur fichier : ils sont prêts.
update public.site_plans set upload_status = 'ready' where upload_status = 'pending' and created_at < now();

create index if not exists site_plans_site_status_idx on public.site_plans (site_id, upload_status);

-- Un plan en attente n'est visible que de son auteur ; les plans prêts par tout utilisateur actif.
drop policy if exists site_plans_select on public.site_plans;
create policy site_plans_select on public.site_plans
  for select to authenticated
  using (private.is_active_user() and (upload_status = 'ready' or uploaded_by = auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. site_plan_pages
-- ---------------------------------------------------------------------------
create table if not exists public.site_plan_pages (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.site_plans (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  image_path text not null unique,
  thumb_path text not null unique,
  image_mime text not null check (image_mime in ('image/png', 'image/jpeg')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, page_number)
);
comment on table public.site_plan_pages is
  'Pages d''un plan converties en images dans le navigateur : image d''affichage (3 500 px) et miniature (400 px).';
comment on column public.site_plan_pages.image_path is 'Chemin dans site-plans : {site_id}/{plan_id}/p{n}.{png|jpg}.';
comment on column public.site_plan_pages.thumb_path is 'Chemin dans site-plans : {site_id}/{plan_id}/p{n}_thumb.jpg.';
create index if not exists site_plan_pages_plan_idx on public.site_plan_pages (plan_id, page_number);

drop trigger if exists set_updated_at on public.site_plan_pages;
create trigger set_updated_at before update on public.site_plan_pages
  for each row execute function private.set_updated_at();

alter table public.site_plan_pages enable row level security;
revoke all on public.site_plan_pages from authenticated;
grant select, insert, update, delete on public.site_plan_pages to authenticated;
grant select, insert, update, delete on public.site_plan_pages to service_role;

-- Lecture : avec le plan (prêt, ou en attente pour son auteur).
create policy site_plan_pages_select on public.site_plan_pages
  for select to authenticated
  using (exists (select 1 from public.site_plans p where p.id = plan_id));

-- Écriture : rt/admin, tant que le plan est en attente. Un plan prêt a ses pages figées.
create or replace function private.plan_is_pending(plan uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.site_plans p where p.id = plan and p.upload_status = 'pending'
  )
$$;
grant execute on function private.plan_is_pending(uuid) to anon, authenticated, service_role;

create policy site_plan_pages_insert on public.site_plan_pages
  for insert to authenticated
  with check (private.is_rt_or_admin() and private.plan_is_pending(plan_id));
create policy site_plan_pages_update on public.site_plan_pages
  for update to authenticated
  using (private.is_rt_or_admin() and private.plan_is_pending(plan_id))
  with check (private.is_rt_or_admin() and private.plan_is_pending(plan_id));
create policy site_plan_pages_delete on public.site_plan_pages
  for delete to authenticated
  using (private.is_rt_or_admin() and private.plan_is_pending(plan_id));

-- ---------------------------------------------------------------------------
-- 3. plan_markers : cohérence contrôlée par trigger
-- ---------------------------------------------------------------------------
create or replace function private.plan_markers_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan record;
  visit_site uuid;
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
drop trigger if exists plan_markers_check on public.plan_markers;
create trigger plan_markers_check before insert or update on public.plan_markers
  for each row execute function private.plan_markers_check();

-- ---------------------------------------------------------------------------
-- 4. Audit : « site_plan.imported » quand le plan devient prêt.
-- ---------------------------------------------------------------------------
create or replace function private.audit_site_plans()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.upload_status = 'ready' then
      perform private.audit('site_plan.imported', 'site_plan', new.id,
        jsonb_build_object('site_id', new.site_id, 'name', new.name, 'page_count', new.page_count));
    end if;
    return new;
  end if;
  if old.upload_status = 'pending' and new.upload_status = 'ready' then
    perform private.audit('site_plan.imported', 'site_plan', new.id,
      jsonb_build_object('site_id', new.site_id, 'name', new.name, 'page_count', new.page_count));
  end if;
  if new.is_archived is distinct from old.is_archived then
    perform private.audit(
      case when new.is_archived then 'site_plan.archived' else 'site_plan.unarchived' end,
      'site_plan', new.id, jsonb_build_object('site_id', new.site_id));
  end if;
  if new.name is distinct from old.name then
    perform private.audit('site_plan.renamed', 'site_plan', new.id,
      jsonb_build_object('site_id', new.site_id, 'from', old.name, 'to', new.name));
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Purge des plans restés en attente
-- ---------------------------------------------------------------------------
create or replace function private.purge_stale_pending_plans(max_age interval default interval '24 hours')
returns table (id uuid, storage_path text, page_paths text[])
language sql
security definer
set search_path = ''
as $$
  with doomed as (
    delete from public.site_plans p
    where p.upload_status = 'pending' and p.created_at < now() - max_age
    returning p.id, p.storage_path
  )
  select
    d.id,
    d.storage_path,
    coalesce(
      (select array_agg(path) from (
        select pp.image_path as path from public.site_plan_pages pp where pp.plan_id = d.id
        union all
        select pp.thumb_path from public.site_plan_pages pp where pp.plan_id = d.id
      ) paths),
      '{}'::text[]
    ) as page_paths
  from doomed d
$$;
comment on function private.purge_stale_pending_plans(interval) is
  'Supprime les plans pending plus anciens que max_age (pages en cascade) et renvoie leurs chemins (objets à effacer par le service).';
revoke execute on function private.purge_stale_pending_plans(interval) from public, anon, authenticated;
grant execute on function private.purge_stale_pending_plans(interval) to service_role;
