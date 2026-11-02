-- Étape 2 · migration 7 : buckets privés et politiques sur storage.objects.
-- Le premier segment du chemin est l'identifiant de la visite ou du site.
-- Aucun accès public : les fichiers sont servis par URL signée (étape 7).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('visit-photos', 'visit-photos', false, 15 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp']),
  ('site-plans', 'site-plans', false, 50 * 1024 * 1024, array['application/pdf', 'image/png', 'image/jpeg']),
  ('reports', 'reports', false, 50 * 1024 * 1024, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Identifiant porté par le premier segment du chemin ({visit_id}/… ou {site_id}/…).
create or replace function private.storage_root_id(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select private.try_uuid((storage.foldername(object_name))[1])
$$;
grant execute on function private.storage_root_id(text) to anon, authenticated, service_role;

-- visit-photos : lecture si la visite est lisible ; écriture (insert, update, delete) si modifiable.
drop policy if exists visit_photos_select on storage.objects;
create policy visit_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'visit-photos' and private.can_read_visit(private.storage_root_id(name)));
drop policy if exists visit_photos_insert on storage.objects;
create policy visit_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'visit-photos' and private.can_edit_visit(private.storage_root_id(name)));
drop policy if exists visit_photos_update on storage.objects;
create policy visit_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'visit-photos' and private.can_edit_visit(private.storage_root_id(name)))
  with check (bucket_id = 'visit-photos' and private.can_edit_visit(private.storage_root_id(name)));
drop policy if exists visit_photos_delete on storage.objects;
create policy visit_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'visit-photos' and private.can_edit_visit(private.storage_root_id(name)));

-- site-plans : lecture par tout utilisateur actif ; insertion par rt/admin ; pas de suppression.
drop policy if exists site_plans_select on storage.objects;
create policy site_plans_select on storage.objects
  for select to authenticated
  using (bucket_id = 'site-plans' and private.is_active_user()
    and exists (select 1 from public.sites s where s.id = private.storage_root_id(name)));
drop policy if exists site_plans_insert on storage.objects;
create policy site_plans_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-plans' and private.is_rt_or_admin()
    and exists (select 1 from public.sites s where s.id = private.storage_root_id(name)));

-- reports : lecture et insertion si la visite est lisible (la direction génère des rapports) ;
-- ni mise à jour ni suppression.
drop policy if exists reports_select on storage.objects;
create policy reports_select on storage.objects
  for select to authenticated
  using (bucket_id = 'reports' and private.can_read_visit(private.storage_root_id(name)));
drop policy if exists reports_insert on storage.objects;
create policy reports_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'reports' and private.can_read_visit(private.storage_root_id(name)));

-- Les buckets eux-mêmes sont listables par les utilisateurs actifs (sans accès public).
drop policy if exists ronde_buckets_select on storage.buckets;
create policy ronde_buckets_select on storage.buckets
  for select to authenticated
  using (id in ('visit-photos', 'site-plans', 'reports') and private.is_active_user());
