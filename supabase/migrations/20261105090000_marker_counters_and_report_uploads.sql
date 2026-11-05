-- Étape 10 · migration 17 : numéros de repère jamais réutilisés, rapports PDF envoyés au stockage.
--
--   1. plan_marker_counters : dernier numéro attribué par (visite, plan). Le trigger
--      plan_markers_before_insert l'incrémente (insert … on conflict do update … returning) : un
--      repère supprimé, même le dernier, ne rend jamais son numéro. Un numéro fourni
--      explicitement ne fait que relever le compteur ;
--   2. reports : upload_status (pending → ready, même parcours que les photos), number (rang du
--      rapport dans la visite), file_name (RONDE_{site}_{date}_{n}.pdf), is_draft (visite en
--      cours au moment de la génération), page_count ;
--   3. confirmation par l'auteur seulement, de pending à ready ; un rapport prêt est figé ;
--      l'audit report.generated n'est écrit qu'au passage à ready ;
--   4. purge des rapports pending de plus de 24 h ;
--   5. visit_summaries : dernier rapport prêt (date et identifiant).

-- ---------------------------------------------------------------------------
-- 1. Compteur des repères
-- ---------------------------------------------------------------------------
create table if not exists public.plan_marker_counters (
  visit_id uuid not null references public.visits (id) on delete cascade,
  plan_id uuid not null references public.site_plans (id) on delete restrict,
  last_number integer not null check (last_number >= 0),
  primary key (visit_id, plan_id)
);
comment on table public.plan_marker_counters is
  'Dernier numéro de repère attribué par (visite, plan) : les numéros ne sont jamais réattribués.';
alter table public.plan_marker_counters enable row level security;
revoke all on public.plan_marker_counters from anon, authenticated;
grant select on public.plan_marker_counters to service_role;

insert into public.plan_marker_counters (visit_id, plan_id, last_number)
select m.visit_id, m.plan_id, max(m.number)
from public.plan_markers m
group by m.visit_id, m.plan_id
on conflict (visit_id, plan_id) do update
  set last_number = greatest(public.plan_marker_counters.last_number, excluded.last_number);

-- 0 (valeur par défaut) ou null : numéro attribué par le compteur.
alter table public.plan_markers alter column number set default 0;
alter table public.plan_markers drop constraint if exists plan_markers_number_check;
alter table public.plan_markers add constraint plan_markers_number_check check (number >= 1);

create or replace function private.plan_markers_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.number is null or new.number <= 0 then
    insert into public.plan_marker_counters as c (visit_id, plan_id, last_number)
    values (new.visit_id, new.plan_id, 1)
    on conflict (visit_id, plan_id) do update set last_number = c.last_number + 1
    returning c.last_number into new.number;
  else
    insert into public.plan_marker_counters as c (visit_id, plan_id, last_number)
    values (new.visit_id, new.plan_id, new.number)
    on conflict (visit_id, plan_id) do update
      set last_number = greatest(c.last_number, excluded.last_number);
  end if;
  return new;
end
$$;
comment on function private.plan_markers_before_insert() is
  'Attribue le numéro du repère par le compteur (visite, plan), sous le verrou de ligne de l''upsert.';
drop trigger if exists plan_markers_before_insert on public.plan_markers;
create trigger plan_markers_before_insert before insert on public.plan_markers
  for each row execute function private.plan_markers_before_insert();

-- Le numéro d'un repère ne change jamais.
create or replace function private.plan_markers_number_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.number <> old.number or new.visit_id <> old.visit_id or new.plan_id <> old.plan_id then
    raise exception 'Le numéro, la visite et le plan d''un repère sont immuables.' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists plan_markers_number_immutable on public.plan_markers;
create trigger plan_markers_number_immutable before update on public.plan_markers
  for each row execute function private.plan_markers_number_immutable();

-- ---------------------------------------------------------------------------
-- 2. Rapports : statut d'envoi, numéro, nom de fichier, brouillon, pages
-- ---------------------------------------------------------------------------
alter table public.reports
  add column if not exists upload_status text not null default 'pending'
    check (upload_status in ('pending', 'ready')),
  add column if not exists number integer check (number >= 1),
  add column if not exists file_name text check (file_name ~ '^RONDE_[A-Za-z0-9-]+_\d{4}-\d{2}-\d{2}_\d+\.pdf$'),
  add column if not exists is_draft boolean not null default false,
  add column if not exists page_count integer check (page_count is null or page_count >= 1);
comment on column public.reports.upload_status is
  'pending : ligne créée avant l''envoi (preuve d''autorisation) ; ready : fichier vérifié. Seuls les ready sont listés.';
comment on column public.reports.number is 'Rang du rapport dans la visite (1, 2, …), attribué par trigger, jamais réutilisé.';
comment on column public.reports.file_name is 'Nom du fichier téléchargé : RONDE_{code site}_{date de visite}_{n}.pdf.';
comment on column public.reports.is_draft is 'Vrai si la visite était en cours au moment de la génération (bandeau BROUILLON).';
comment on column public.reports.page_count is 'Nombre de pages du PDF, déclaré à la confirmation.';

-- Code du site utilisable dans un nom de fichier.
create or replace function private.report_file_name(site_code text, visit_date date, report_number integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'RONDE_' || regexp_replace(site_code, '[^A-Za-z0-9-]', '-', 'g') || '_'
    || to_char(visit_date, 'YYYY-MM-DD') || '_' || report_number::text || '.pdf'
$$;

-- Rapports antérieurs : ils ont été créés avec leur fichier, ils sont prêts.
update public.reports r
set upload_status = 'ready',
    number = n.rank,
    file_name = private.report_file_name(s.warehouse_code, v.visit_date, n.rank::integer)
from (
  select id, row_number() over (partition by visit_id order by generated_at, id) as rank
  from public.reports
) n, public.visits v, public.sites s
where n.id = r.id and v.id = r.visit_id and s.id = v.site_id and r.number is null;

alter table public.reports alter column number set not null;
alter table public.reports alter column file_name set not null;
alter table public.reports add constraint reports_visit_number_key unique (visit_id, number);
create index if not exists reports_pending_idx on public.reports (generated_at) where upload_status = 'pending';

create or replace function private.reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  visit record;
begin
  select v.status, v.visit_date, s.warehouse_code into visit
  from public.visits v join public.sites s on s.id = v.site_id
  where v.id = new.visit_id;
  if visit is null then
    raise exception 'Visite introuvable.' using errcode = '23503';
  end if;
  -- Numérotation par visite, sérialisée : deux générations simultanées ont des numéros distincts.
  perform pg_advisory_xact_lock(hashtextextended('reports:' || new.visit_id::text, 0));
  select coalesce(max(r.number), 0) + 1 into new.number
  from public.reports r where r.visit_id = new.visit_id;
  new.file_name := private.report_file_name(visit.warehouse_code, visit.visit_date, new.number);
  new.is_draft := visit.status <> 'completed';
  new.upload_status := 'pending';
  new.size_bytes := null;
  new.page_count := null;
  -- Date serveur, sauf pour les données de démonstration chargées par postgres (seed).
  if current_user <> 'postgres' then
    new.generated_at := now();
  end if;
  return new;
end
$$;
drop trigger if exists reports_before_insert on public.reports;
create trigger reports_before_insert before insert on public.reports
  for each row execute function private.reports_before_insert();

-- Seule transition permise : pending → ready, avec la taille et le nombre de pages. Un rapport
-- prêt n'est plus jamais modifié.
create or replace function private.reports_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.upload_status = 'ready' then
    raise exception 'Un rapport enregistré n''est jamais modifié.' using errcode = '42501';
  end if;
  if new.upload_status <> 'ready' then
    raise exception 'Un rapport ne peut que passer de pending à ready.' using errcode = '23514';
  end if;
  if (new.id, new.visit_id, new.storage_path, new.options, new.generated_by, new.generated_at,
      new.number, new.file_name, new.is_draft)
     is distinct from
     (old.id, old.visit_id, old.storage_path, old.options, old.generated_by, old.generated_at,
      old.number, old.file_name, old.is_draft) then
    raise exception 'Seuls le statut, la taille et le nombre de pages se confirment.' using errcode = '42501';
  end if;
  if new.size_bytes is null or new.page_count is null then
    raise exception 'La taille et le nombre de pages sont obligatoires à la confirmation.' using errcode = '23514';
  end if;
  return new;
end
$$;
drop trigger if exists reports_before_update on public.reports;
create trigger reports_before_update before update on public.reports
  for each row execute function private.reports_before_update();

drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (
    private.can_read_visit(visit_id)
    and (upload_status = 'ready' or generated_by = auth.uid())
  );

drop policy if exists reports_update_own_pending on public.reports;
create policy reports_update_own_pending on public.reports
  for update to authenticated
  using (generated_by = auth.uid() and upload_status = 'pending' and private.can_read_visit(visit_id))
  with check (generated_by = auth.uid() and private.can_read_visit(visit_id));
grant update (upload_status, size_bytes, page_count) on public.reports to authenticated;

-- Audit au passage à ready (la ligne pending n'est qu'une réservation).
create or replace function private.audit_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.upload_status = 'ready' and (tg_op = 'INSERT' or old.upload_status = 'pending') then
    perform private.audit('report.generated', 'report', new.id,
      jsonb_build_object(
        'visit_id', new.visit_id,
        'number', new.number,
        'is_draft', new.is_draft,
        'page_count', new.page_count,
        'size_bytes', new.size_bytes
      ));
  end if;
  return new;
end
$$;
drop trigger if exists audit_reports on public.reports;
create trigger audit_reports after insert or update on public.reports
  for each row execute function private.audit_reports();

-- ---------------------------------------------------------------------------
-- 4. Purge des rapports en attente
-- ---------------------------------------------------------------------------
create or replace function private.purge_stale_pending_reports(max_age interval default interval '24 hours')
returns table (id uuid, storage_path text)
language sql
security definer
set search_path = ''
as $$
  delete from public.reports r
  where r.upload_status = 'pending' and r.generated_at < now() - max_age
  returning r.id, r.storage_path
$$;
comment on function private.purge_stale_pending_reports(interval) is
  'Supprime les rapports pending plus anciens que max_age et renvoie leurs chemins (objets à effacer par le service).';
revoke execute on function private.purge_stale_pending_reports(interval) from public, anon, authenticated;
grant execute on function private.purge_stale_pending_reports(interval) to service_role;

-- ---------------------------------------------------------------------------
-- 5. visit_summaries : dernier rapport prêt
-- ---------------------------------------------------------------------------
create or replace view public.visit_summaries
with (security_invoker = true)
as
select
  v.id,
  v.site_id,
  s.warehouse_code as site_code,
  s.name as site_name,
  s.city as site_city,
  v.type,
  v.reason,
  v.title,
  v.visit_date,
  v.subject,
  v.status,
  v.writer_id,
  v.created_by,
  v.completed_at,
  v.version,
  v.created_at,
  v.updated_at,
  coalesce(rs.open_count, 0)::integer as open_reserves_count,
  coalesce(rs.overdue_count, 0)::integer as overdue_reserves_count,
  coalesce(rs.done_count, 0)::integer as done_reserves_count,
  coalesce(ph.photo_count, 0)::integer as photos_count,
  rp.last_report_at,
  coalesce(zn.zones_count, 0)::integer as zones_count,
  coalesce(zn.filled_count, 0)::integer as filled_zones_count,
  rp.last_report_id
from public.visits v
join public.sites s on s.id = v.site_id
left join lateral (
  select
    count(*) filter (where r.status <> 'done') as open_count,
    count(*) filter (where private.is_reserve_overdue(r.due_date, r.status, now())) as overdue_count,
    count(*) filter (where r.status = 'done') as done_count
  from public.reserves r
  where r.visit_id = v.id and r.deleted_at is null
) rs on true
left join lateral (
  select count(*) as photo_count
  from public.photos p
  where p.visit_id = v.id and p.upload_status = 'ready'
) ph on true
left join lateral (
  select rep.generated_at as last_report_at, rep.id as last_report_id
  from public.reports rep
  where rep.visit_id = v.id and rep.upload_status = 'ready'
  order by rep.generated_at desc, rep.number desc
  limit 1
) rp on true
left join lateral (
  select
    count(*) as zones_count,
    count(*) filter (where btrim(n.content) <> '') as filled_count
  from public.visit_zone_notes n
  where n.visit_id = v.id
) zn on true
where v.deleted_at is null;
comment on view public.visit_summaries is
  'Visite + site + compteurs de réserves (ouvertes, en retard, levées), photos prêtes, dernier rapport prêt (date, identifiant) et zones (total, renseignées). Visites supprimées exclues.';
grant select on public.visit_summaries to anon, authenticated, service_role;
