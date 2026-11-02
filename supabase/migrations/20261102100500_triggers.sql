-- Étape 2 · migration 6 : triggers de cohérence, de traçabilité et de protection.

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'sites', 'visits', 'visit_participants', 'visit_zone_notes',
    'photos', 'site_plans', 'plan_markers', 'reserves'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Garde en ajout seul : audit_log et reserve_events.
--   * update / delete refusés pour TOUS les rôles, service_role et postgres compris ;
--   * insert refusé sans le marqueur ronde.internal_write, posé par les fonctions internes.
-- ---------------------------------------------------------------------------
create or replace function private.reject_append_only_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% est en ajout seul : % interdit.', tg_table_name, tg_op using errcode = '42501';
end
$$;

create or replace function private.require_internal_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('ronde.internal_write', true), '') <> '1' then
    raise exception '% n''accepte aucune écriture directe.', tg_table_name using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists audit_log_append_only on public.audit_log;
create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function private.reject_append_only_change();
drop trigger if exists audit_log_internal_only on public.audit_log;
create trigger audit_log_internal_only
  before insert on public.audit_log
  for each row execute function private.require_internal_write();

drop trigger if exists reserve_events_append_only on public.reserve_events;
create trigger reserve_events_append_only
  before update or delete on public.reserve_events
  for each row execute function private.reject_append_only_change();
drop trigger if exists reserve_events_internal_only on public.reserve_events;
create trigger reserve_events_internal_only
  before insert on public.reserve_events
  for each row execute function private.require_internal_write();

-- Diff de deux lignes au format { "champ": { "old": …, "new": … } }, hors colonnes techniques.
create or replace function private.jsonb_diff(old_row jsonb, new_row jsonb, ignored text[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value)),
    '{}'::jsonb
  )
  from jsonb_each(new_row) n
  left join jsonb_each(old_row) o on o.key = n.key
  where n.value is distinct from o.value
    and not (n.key = any (ignored))
$$;

-- ---------------------------------------------------------------------------
-- profiles : rôle, activation et email réservés au service ; audit des changements.
-- ---------------------------------------------------------------------------
create or replace function private.protect_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.role, new.is_active, new.email, new.must_change_password)
     is distinct from (old.role, old.is_active, old.email, old.must_change_password)
     and current_user not in ('service_role', 'postgres')
  then
    raise exception 'Seul le service peut modifier le rôle, l''activation, l''email ou l''état du mot de passe.'
      using errcode = '42501';
  end if;
  if new.id <> old.id then
    raise exception 'L''identifiant d''un profil est immuable.' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function private.protect_profile_columns();

create or replace function private.audit_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    perform private.audit('profile.role_changed', 'profile', new.id,
      jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  if new.is_active is distinct from old.is_active then
    perform private.audit(
      case when new.is_active then 'profile.activated' else 'profile.deactivated' end,
      'profile', new.id, '{}'::jsonb);
  end if;
  return new;
end
$$;

drop trigger if exists audit_profile_changes on public.profiles;
create trigger audit_profile_changes
  after update on public.profiles
  for each row execute function private.audit_profile_changes();

-- ---------------------------------------------------------------------------
-- visits : site actif à la création, site immuable, version, colonnes réservées aux RPC, audit.
-- ---------------------------------------------------------------------------
create or replace function private.visits_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.sites s where s.id = new.site_id and s.is_active) then
    raise exception 'Impossible de créer une visite sur un site inactif ou inconnu.'
      using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists visits_before_insert on public.visits;
create trigger visits_before_insert
  before insert on public.visits
  for each row execute function private.visits_before_insert();

create or replace function private.visits_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.site_id <> old.site_id then
    raise exception 'Le site d''une visite est immuable : supprimez la visite et recréez-la.'
      using errcode = '42501';
  end if;
  if new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'Le créateur d''une visite est immuable.' using errcode = '42501';
  end if;
  if (new.status, new.completed_at, new.completed_by, new.deleted_at, new.deleted_by)
     is distinct from (old.status, old.completed_at, old.completed_by, old.deleted_at, old.deleted_by)
     and coalesce(current_setting('ronde.rpc', true), '') <> '1'
     and current_user <> 'postgres'
  then
    raise exception 'Le statut et la suppression d''une visite passent par complete_visit, reopen_visit ou soft_delete_visit.'
      using errcode = '42501';
  end if;
  new.version := old.version + 1;
  return new;
end
$$;

drop trigger if exists visits_before_update on public.visits;
create trigger visits_before_update
  before update on public.visits
  for each row execute function private.visits_before_update();

create or replace function private.audit_visits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  diff jsonb;
begin
  if tg_op = 'INSERT' then
    perform private.audit('visit.created', 'visit', new.id,
      jsonb_build_object('site_id', new.site_id, 'title', new.title, 'visit_date', new.visit_date));
    return new;
  end if;

  -- Clôture, réouverture et suppression sont tracées par les RPC elles-mêmes.
  diff := private.jsonb_diff(
    to_jsonb(old), to_jsonb(new),
    array['updated_at', 'version', 'status', 'completed_at', 'completed_by', 'deleted_at', 'deleted_by']
  );
  if diff <> '{}'::jsonb then
    perform private.audit('visit.updated', 'visit', new.id, jsonb_build_object('changes', diff));
  end if;
  return new;
end
$$;

drop trigger if exists audit_visits on public.visits;
create trigger audit_visits
  after insert or update on public.visits
  for each row execute function private.audit_visits();

-- ---------------------------------------------------------------------------
-- reserves : site_id, numérotation par site, closed_at / closed_by, historique, audit.
-- ---------------------------------------------------------------------------
create or replace function private.reserves_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  visit_site uuid;
begin
  select v.site_id into visit_site from public.visits v where v.id = new.visit_id;
  if visit_site is null then
    raise exception 'Visite inconnue.' using errcode = '23503';
  end if;
  if new.site_id is not null and new.site_id <> visit_site then
    raise exception 'Le site de la réserve doit être celui de sa visite.' using errcode = '23514';
  end if;
  new.site_id := visit_site;

  -- Numérotation séquentielle par site, sous verrou consultatif transactionnel.
  perform pg_advisory_xact_lock(hashtext('reserves:' || new.site_id::text));
  select coalesce(max(r.number), 0) + 1 into new.number
  from public.reserves r
  where r.site_id = new.site_id;

  if new.status = 'done' then
    new.closed_at := coalesce(new.closed_at, now());
    new.closed_by := coalesce(new.closed_by, auth.uid());
  else
    new.closed_at := null;
    new.closed_by := null;
  end if;
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end
$$;

drop trigger if exists reserves_before_insert on public.reserves;
create trigger reserves_before_insert
  before insert on public.reserves
  for each row execute function private.reserves_before_insert();

create or replace function private.reserves_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visit_id <> old.visit_id or new.site_id <> old.site_id or new.number <> old.number then
    raise exception 'La visite, le site et le numéro d''une réserve sont immuables.' using errcode = '42501';
  end if;
  if new.status = 'done' and old.status <> 'done' then
    new.closed_at := now();
    new.closed_by := auth.uid();
  elsif new.status <> 'done' then
    new.closed_at := null;
    new.closed_by := null;
  end if;
  if new.deleted_at is not null and old.deleted_at is null and new.deleted_by is null then
    new.deleted_by := auth.uid();
  end if;
  return new;
end
$$;

drop trigger if exists reserves_before_update on public.reserves;
create trigger reserves_before_update
  before update on public.reserves
  for each row execute function private.reserves_before_update();

create or replace function private.record_reserve_event(
  reserve_id uuid,
  event_type public.reserve_event_type,
  from_status public.reserve_status,
  to_status public.reserve_status,
  changes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('ronde.internal_write', '1', true);
  insert into public.reserve_events (reserve_id, event_type, from_status, to_status, changes, actor_id)
  values (reserve_id, event_type, from_status, to_status, coalesce(changes, '{}'::jsonb), auth.uid());
  perform set_config('ronde.internal_write', '', true);
end
$$;
revoke execute on function private.record_reserve_event(uuid, public.reserve_event_type, public.reserve_status, public.reserve_status, jsonb)
  from public, anon, authenticated;

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

  diff := private.jsonb_diff(to_jsonb(old), to_jsonb(new), array['updated_at', 'closed_at', 'closed_by', 'deleted_by']);

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

drop trigger if exists reserves_after_change on public.reserves;
create trigger reserves_after_change
  after insert or update on public.reserves
  for each row execute function private.reserves_after_change();

-- ---------------------------------------------------------------------------
-- reports, site_plans, site_import_runs : audit.
-- ---------------------------------------------------------------------------
create or replace function private.audit_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.audit('report.generated', 'report', new.id,
    jsonb_build_object('visit_id', new.visit_id, 'storage_path', new.storage_path));
  return new;
end
$$;
drop trigger if exists audit_reports on public.reports;
create trigger audit_reports after insert on public.reports
  for each row execute function private.audit_reports();

create or replace function private.audit_site_plans()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit('site_plan.imported', 'site_plan', new.id,
      jsonb_build_object('site_id', new.site_id, 'name', new.name));
  elsif new.is_archived is distinct from old.is_archived then
    perform private.audit(
      case when new.is_archived then 'site_plan.archived' else 'site_plan.unarchived' end,
      'site_plan', new.id, jsonb_build_object('site_id', new.site_id));
  end if;
  return new;
end
$$;
drop trigger if exists audit_site_plans on public.site_plans;
create trigger audit_site_plans after insert or update on public.site_plans
  for each row execute function private.audit_site_plans();

create or replace function private.audit_site_import_runs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.audit(
    case when new.mode = 'apply' then 'site_import.applied' else 'site_import.simulated' end,
    'site_import_run', new.id,
    jsonb_build_object('file_name', new.file_name, 'rows_total', new.rows_total,
      'rows_created', new.rows_created, 'rows_updated', new.rows_updated,
      'rows_deactivated', new.rows_deactivated, 'rows_rejected', new.rows_rejected),
    new.performed_by);
  return new;
end
$$;
drop trigger if exists audit_site_import_runs on public.site_import_runs;
create trigger audit_site_import_runs after insert on public.site_import_runs
  for each row execute function private.audit_site_import_runs();
