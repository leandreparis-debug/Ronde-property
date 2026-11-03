-- Étape 7 · migration 14 : photos envoyées directement au stockage.
--
--   1. photos.upload_status : `pending` à la création de la ligne (preuve d'autorisation avant toute
--      URL signée), `ready` une fois les deux objets vérifiés ; thumb_path pour la miniature ;
--   2. une photo `pending` n'est visible nulle part : visit_summaries ne compte que les `ready`,
--      et l'unicité de la photo de garde ne porte que sur les `ready` ;
--   3. private.purge_stale_pending_photos(interval) supprime les lignes `pending` trop anciennes et
--      renvoie leurs chemins pour que le service efface les objets.

alter table public.photos
  add column if not exists upload_status text not null default 'pending'
    check (upload_status in ('pending', 'ready')),
  add column if not exists thumb_path text unique;
comment on column public.photos.upload_status is
  'pending : ligne créée avant l''envoi (URL signée délivrée) ; ready : objets vérifiés. Seules les ready sont listées.';
comment on column public.photos.thumb_path is 'Chemin de la miniature JPEG 400 px dans le bucket visit-photos : {visit_id}/{photo_id}_thumb.jpg.';

-- Les lignes antérieures à cette migration ont été créées avec leur objet : elles sont prêtes.
update public.photos set upload_status = 'ready' where upload_status = 'pending' and created_at < now();

create index if not exists photos_visit_status_idx on public.photos (visit_id, upload_status);

drop index if exists public.photos_one_cover_per_visit_idx;
create unique index if not exists photos_one_cover_per_visit_idx
  on public.photos (visit_id)
  where is_cover and upload_status = 'ready';

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
  select count(*) as photo_count
  from public.photos p
  where p.visit_id = v.id and p.upload_status = 'ready'
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
  'Visite + site + compteurs de réserves (ouvertes, en retard, levées), photos prêtes, dernier rapport et zones (total, renseignées). Visites supprimées exclues.';

grant select on public.visit_summaries to anon, authenticated, service_role;

-- Purge des photos restées en attente (envoi jamais confirmé). Appelée par le service, qui
-- efface ensuite les objets renvoyés. Une tâche planifiée la remplacera à l'étape 11.
create or replace function private.purge_stale_pending_photos(max_age interval default interval '24 hours')
returns table (id uuid, storage_path text, thumb_path text)
language sql
security definer
set search_path = ''
as $$
  delete from public.photos p
  where p.upload_status = 'pending' and p.created_at < now() - max_age
  returning p.id, p.storage_path, p.thumb_path
$$;
comment on function private.purge_stale_pending_photos(interval) is
  'Supprime les photos pending plus anciennes que max_age et renvoie leurs chemins (objets à effacer par le service).';
revoke execute on function private.purge_stale_pending_photos(interval) from public, anon, authenticated;
grant execute on function private.purge_stale_pending_photos(interval) to service_role;
