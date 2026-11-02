-- Étape 2 · migration 5 : Row Level Security.
--
-- Principes :
--   * RLS activée sur toutes les tables de public. Un utilisateur inactif ou sans profil ne
--     voit rien ; le rôle anon n'a accès à rien (aucune politique pour anon).
--   * service_role contourne la RLS (bypassrls) : réservé au serveur (import VIGIE, comptes).
--   * Pas de delete physique par les utilisateurs : aucune politique delete, sauf pour les
--     tables filles d'une visite modifiable (participants, notes, photos, repères, liens photo).
--   * audit_log et reserve_events : aucune écriture directe, triggers security definer seulement.

-- Privilèges : on retire tout, puis on rend ce qui est nécessaire ; la RLS fait le reste.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ---------------------------------------------------------------------------
-- profiles : lecture limitée à id, full_name, role, is_active ; mise à jour de full_name seul.
-- L'email et must_change_password sont lus côté serveur (service_role) uniquement.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
revoke all on public.profiles from authenticated;
grant select (id, full_name, role, is_active) on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

create policy profiles_select_active_users on public.profiles
  for select to authenticated
  using (private.is_active_user());

create policy profiles_update_own_name on public.profiles
  for update to authenticated
  using (private.is_active_user() and id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- sites : lecture par tout utilisateur actif ; aucune écriture hors service_role.
-- ---------------------------------------------------------------------------
alter table public.sites enable row level security;
revoke all on public.sites from authenticated;
grant select on public.sites to authenticated;

create policy sites_select_active_users on public.sites
  for select to authenticated
  using (private.is_active_user());

-- site_import_runs : lecture admin ; écriture service_role (import, étape 4).
alter table public.site_import_runs enable row level security;
revoke all on public.site_import_runs from authenticated;
grant select on public.site_import_runs to authenticated;

create policy site_import_runs_select_admin on public.site_import_runs
  for select to authenticated
  using (private.is_admin());

-- ---------------------------------------------------------------------------
-- visits : lecture par tout utilisateur actif hors supprimées (admin : toutes) ;
-- insertion par rt/admin avec created_by = auth.uid() ; mise à jour si can_edit_visit ;
-- status, completed_* et deleted_* uniquement par RPC (trigger, migration 6) ; pas de delete.
-- ---------------------------------------------------------------------------
alter table public.visits enable row level security;
revoke all on public.visits from authenticated;
grant select, insert, update on public.visits to authenticated;

create policy visits_select_active_users on public.visits
  for select to authenticated
  using (private.is_active_user() and (deleted_at is null or private.is_admin()));

create policy visits_insert_rt_admin on public.visits
  for insert to authenticated
  with check (private.is_rt_or_admin() and created_by = auth.uid());

create policy visits_update_editors on public.visits
  for update to authenticated
  using (private.can_edit_visit(id))
  with check (private.can_edit_visit(id));

-- ---------------------------------------------------------------------------
-- Tables filles d'une visite : lecture si la visite est lisible, écriture si modifiable.
-- ---------------------------------------------------------------------------
alter table public.visit_participants enable row level security;
revoke all on public.visit_participants from authenticated;
grant select, insert, update, delete on public.visit_participants to authenticated;
create policy visit_participants_select on public.visit_participants
  for select to authenticated using (private.can_read_visit(visit_id));
create policy visit_participants_insert on public.visit_participants
  for insert to authenticated with check (private.can_edit_visit(visit_id));
create policy visit_participants_update on public.visit_participants
  for update to authenticated using (private.can_edit_visit(visit_id)) with check (private.can_edit_visit(visit_id));
create policy visit_participants_delete on public.visit_participants
  for delete to authenticated using (private.can_edit_visit(visit_id));

alter table public.visit_zone_notes enable row level security;
revoke all on public.visit_zone_notes from authenticated;
grant select, insert, update, delete on public.visit_zone_notes to authenticated;
create policy visit_zone_notes_select on public.visit_zone_notes
  for select to authenticated using (private.can_read_visit(visit_id));
create policy visit_zone_notes_insert on public.visit_zone_notes
  for insert to authenticated with check (private.can_edit_visit(visit_id));
create policy visit_zone_notes_update on public.visit_zone_notes
  for update to authenticated using (private.can_edit_visit(visit_id)) with check (private.can_edit_visit(visit_id));
create policy visit_zone_notes_delete on public.visit_zone_notes
  for delete to authenticated using (private.can_edit_visit(visit_id));

alter table public.photos enable row level security;
revoke all on public.photos from authenticated;
grant select, insert, update, delete on public.photos to authenticated;
create policy photos_select on public.photos
  for select to authenticated using (private.can_read_visit(visit_id));
create policy photos_insert on public.photos
  for insert to authenticated with check (private.can_edit_visit(visit_id));
create policy photos_update on public.photos
  for update to authenticated using (private.can_edit_visit(visit_id)) with check (private.can_edit_visit(visit_id));
create policy photos_delete on public.photos
  for delete to authenticated using (private.can_edit_visit(visit_id));

alter table public.plan_markers enable row level security;
revoke all on public.plan_markers from authenticated;
grant select, insert, update, delete on public.plan_markers to authenticated;
create policy plan_markers_select on public.plan_markers
  for select to authenticated using (private.can_read_visit(visit_id));
create policy plan_markers_insert on public.plan_markers
  for insert to authenticated with check (private.can_edit_visit(visit_id));
create policy plan_markers_update on public.plan_markers
  for update to authenticated using (private.can_edit_visit(visit_id)) with check (private.can_edit_visit(visit_id));
create policy plan_markers_delete on public.plan_markers
  for delete to authenticated using (private.can_edit_visit(visit_id));

-- reserve_photos : droits de la visite de la réserve.
alter table public.reserve_photos enable row level security;
revoke all on public.reserve_photos from authenticated;
grant select, insert, update, delete on public.reserve_photos to authenticated;
create policy reserve_photos_select on public.reserve_photos
  for select to authenticated
  using (exists (
    select 1 from public.reserves r where r.id = reserve_id and private.can_read_visit(r.visit_id)
  ));
create policy reserve_photos_insert on public.reserve_photos
  for insert to authenticated
  with check (exists (
    select 1 from public.reserves r where r.id = reserve_id and private.can_edit_visit(r.visit_id)
  ));
create policy reserve_photos_update on public.reserve_photos
  for update to authenticated
  using (exists (select 1 from public.reserves r where r.id = reserve_id and private.can_edit_visit(r.visit_id)))
  with check (exists (select 1 from public.reserves r where r.id = reserve_id and private.can_edit_visit(r.visit_id)));
create policy reserve_photos_delete on public.reserve_photos
  for delete to authenticated
  using (exists (select 1 from public.reserves r where r.id = reserve_id and private.can_edit_visit(r.visit_id)));

-- ---------------------------------------------------------------------------
-- site_plans : lecture par tout utilisateur actif ; insertion et mise à jour (archivage)
-- par rt/admin ; pas de suppression physique.
-- ---------------------------------------------------------------------------
alter table public.site_plans enable row level security;
revoke all on public.site_plans from authenticated;
grant select, insert, update on public.site_plans to authenticated;
create policy site_plans_select on public.site_plans
  for select to authenticated using (private.is_active_user());
create policy site_plans_insert on public.site_plans
  for insert to authenticated with check (private.is_rt_or_admin());
create policy site_plans_update on public.site_plans
  for update to authenticated using (private.is_rt_or_admin()) with check (private.is_rt_or_admin());

-- ---------------------------------------------------------------------------
-- reserves : lecture par tout utilisateur actif hors supprimées (admin : toutes) ;
-- insertion et mise à jour si can_edit_visit ; suppression logique uniquement (update).
-- ---------------------------------------------------------------------------
alter table public.reserves enable row level security;
revoke all on public.reserves from authenticated;
grant select, insert, update on public.reserves to authenticated;
create policy reserves_select on public.reserves
  for select to authenticated
  using (private.can_read_visit(visit_id) and (deleted_at is null or private.is_admin()));
create policy reserves_insert on public.reserves
  for insert to authenticated with check (private.can_edit_visit(visit_id));
create policy reserves_update on public.reserves
  for update to authenticated using (private.can_edit_visit(visit_id)) with check (private.can_edit_visit(visit_id));

-- ---------------------------------------------------------------------------
-- reserve_events : lecture par tout utilisateur actif ; aucune écriture directe.
-- audit_log : lecture admin ; aucune écriture directe.
-- ---------------------------------------------------------------------------
alter table public.reserve_events enable row level security;
revoke all on public.reserve_events from authenticated;
grant select on public.reserve_events to authenticated;
create policy reserve_events_select on public.reserve_events
  for select to authenticated
  using (exists (
    select 1 from public.reserves r where r.id = reserve_id and private.can_read_visit(r.visit_id)
  ));

alter table public.audit_log enable row level security;
revoke all on public.audit_log from authenticated;
grant select on public.audit_log to authenticated;
create policy audit_log_select_admin on public.audit_log
  for select to authenticated using (private.is_admin());

-- ---------------------------------------------------------------------------
-- reports : lecture par tout utilisateur actif si la visite est lisible ; insertion par rt,
-- admin ou direction (la direction peut générer un rapport) ; ni mise à jour ni suppression.
-- ---------------------------------------------------------------------------
alter table public.reports enable row level security;
revoke all on public.reports from authenticated;
grant select, insert on public.reports to authenticated;
create policy reports_select on public.reports
  for select to authenticated using (private.can_read_visit(visit_id));
create policy reports_insert on public.reports
  for insert to authenticated
  with check (private.can_read_visit(visit_id) and generated_by = auth.uid());
