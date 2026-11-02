-- Étape 6 · migration 12 : notes par zone.
--
--   1. visit_zone_notes.version : concurrence optimiste **par note**, incrémentée par trigger
--      quand le contenu change (et seulement lui) ; updated_by et updated_at suivent le contenu ;
--   2. la **structure** des zones (ajout, retrait, libellé, ordre) touche la visite parente
--      (version +1, updated_by), par trigger d'instruction : une trame de neuf zones insérée
--      en une instruction n'incrémente la visite qu'une fois ;
--   3. visit_summaries expose zones_count et filled_zones_count, calculés à la lecture.
--
-- Pourquoi deux niveaux : deux RT doivent pouvoir écrire dans deux zones différentes de la
-- même visite sans se gêner, et la saisie d'un contenu ne doit pas invalider le formulaire
-- d'informations ouvert ailleurs. La structure, elle, est partagée : elle suit la version de
-- la visite, comme les participants (docs/notes.md).

alter table public.visit_zone_notes
  add column if not exists version integer not null default 1;
comment on column public.visit_zone_notes.version is
  'Version de la note, incrémentée par trigger à chaque changement de contenu (concurrence optimiste par zone).';

-- Avant mise à jour : visite et clé immuables ; version, updated_by et updated_at suivent le contenu.
-- Le trigger générique set_updated_at s'exécute avant celui-ci (ordre alphabétique) : on rétablit
-- updated_at quand seule la structure change, pour que « Modifié par … à … » parle du texte.
create or replace function private.zone_notes_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visit_id <> old.visit_id or new.zone_key <> old.zone_key then
    raise exception 'La visite et la clé d''une zone sont immuables.' using errcode = '42501';
  end if;
  if new.content is distinct from old.content then
    new.version := old.version + 1;
    new.updated_by := auth.uid();
    new.updated_at := now();
  else
    new.version := old.version;
    new.updated_by := old.updated_by;
    new.updated_at := old.updated_at;
  end if;
  return new;
end
$$;

drop trigger if exists zone_notes_before_update on public.visit_zone_notes;
create trigger zone_notes_before_update
  before update on public.visit_zone_notes
  for each row execute function private.zone_notes_before_update();

-- Après chaque instruction qui change la structure : la visite parente est touchée une fois
-- par visite concernée (version +1, updated_at, updated_by via visits_before_update).
create or replace function private.touch_parent_visit_from_zone_notes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.visits set updated_at = now()
    where id in (select distinct visit_id from inserted);
  elsif tg_op = 'DELETE' then
    update public.visits set updated_at = now()
    where id in (select distinct visit_id from deleted);
  else
    update public.visits set updated_at = now()
    where id in (
      select distinct n.visit_id
      from updated n
      join previous o on o.id = n.id
      where n.zone_label is distinct from o.zone_label
         or n.sort_order is distinct from o.sort_order
    );
  end if;
  return null;
end
$$;

drop trigger if exists touch_parent_visit_insert on public.visit_zone_notes;
create trigger touch_parent_visit_insert
  after insert on public.visit_zone_notes
  referencing new table as inserted
  for each statement execute function private.touch_parent_visit_from_zone_notes();

drop trigger if exists touch_parent_visit_delete on public.visit_zone_notes;
create trigger touch_parent_visit_delete
  after delete on public.visit_zone_notes
  referencing old table as deleted
  for each statement execute function private.touch_parent_visit_from_zone_notes();

drop trigger if exists touch_parent_visit_update on public.visit_zone_notes;
create trigger touch_parent_visit_update
  after update on public.visit_zone_notes
  referencing old table as previous new table as updated
  for each statement execute function private.touch_parent_visit_from_zone_notes();

-- Compteurs de zones : colonnes ajoutées en fin de vue (create or replace l'exige).
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
  coalesce(zn.filled_count, 0)::integer as filled_zones_count
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
  select count(*) as photo_count from public.photos p where p.visit_id = v.id
) ph on true
left join lateral (
  select max(rep.generated_at) as last_report_at from public.reports rep where rep.visit_id = v.id
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
  'Visite + site + compteurs de réserves (ouvertes, en retard, levées), photos, dernier rapport et zones (total, renseignées). Visites supprimées exclues.';

grant select on public.visit_summaries to anon, authenticated, service_role;
