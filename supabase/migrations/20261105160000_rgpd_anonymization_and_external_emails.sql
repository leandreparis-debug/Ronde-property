-- Migration 19 : RGPD (étape 11).
--
--   1. Historique des réserves : l'e-mail d'un responsable externe n'entre plus jamais dans
--      reserve_events (en ajout seul) ; un changement y est noté « [masqué] ».
--   2. Anonymisation d'un compte déjà désactivé : profiles.anonymized_at, fonction
--      private.anonymize_profile (service uniquement), irréversible.
--   3. Effacement des e-mails des responsables externes des réserves levées depuis plus de
--      N mois : private.clear_external_responsible_emails (simulation ou application).

-- ---------------------------------------------------------------------------
-- 1. Aucun e-mail dans l'historique des réserves
-- ---------------------------------------------------------------------------
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
  -- L'e-mail d'un responsable externe n'apparaît que dans le détail de la réserve, jamais
  -- dans un journal : seul le fait qu'il a changé est conservé.
  if diff ? 'responsible_email' then
    diff := diff || jsonb_build_object('responsible_email', jsonb_build_object(
      'old', case when old.responsible_email is null then null else '[masqué]' end,
      'new', case when new.responsible_email is null then null else '[masqué]' end));
  end if;

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
-- 2. Anonymisation d'un compte désactivé
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists anonymized_at timestamptz;

comment on column public.profiles.anonymized_at is
  'Date d''anonymisation RGPD (nom et e-mail remplacés, irréversible). Réservée au service.';

create or replace function private.protect_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.role, new.is_active, new.email, new.must_change_password, new.sessions_revoked_at,
      new.anonymized_at)
     is distinct from
     (old.role, old.is_active, old.email, old.must_change_password, old.sessions_revoked_at,
      old.anonymized_at)
     and current_user not in ('service_role', 'postgres')
  then
    raise exception 'Seul le service peut modifier le rôle, l''activation, l''email, l''état du mot de passe, les sessions ou l''anonymisation.'
      using errcode = '42501';
  end if;
  if new.id <> old.id then
    raise exception 'L''identifiant d''un profil est immuable.' using errcode = '42501';
  end if;
  if old.anonymized_at is not null then
    if new.anonymized_at is null or new.is_active
       or (new.full_name, new.email) is distinct from (old.full_name, old.email) then
      raise exception 'Un compte anonymisé ne se réactive pas et ne se modifie plus.'
        using errcode = '42501';
    end if;
  elsif new.anonymized_at is not null and (old.is_active or new.is_active) then
    raise exception 'Seul un compte déjà désactivé peut être anonymisé.' using errcode = '42501';
  end if;
  if old.is_active and not new.is_active then
    new.sessions_revoked_at := date_trunc('second', now());
  end if;
  return new;
end
$$;

-- Nom de remplacement : « Compte anonymisé » et 6 caractères tirés de l'identifiant, pour
-- distinguer deux comptes anonymisés dans l'historique sans rien révéler de la personne.
create or replace function private.anonymous_profile_name(profile_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Compte anonymisé ' || upper(left(replace(profile_id::text, '-', ''), 6))
$$;

create or replace function private.anonymous_profile_email(profile_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'anonyme+' || replace(profile_id::text, '-', '') || '@ronde.invalid'
$$;

create or replace function private.anonymize_profile(target uuid, actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile record;
begin
  select id, is_active, anonymized_at into profile
  from public.profiles where id = target for update;
  if not found then
    raise exception 'Compte introuvable.' using errcode = 'P0002';
  end if;
  if profile.anonymized_at is not null then
    raise exception 'Ce compte est déjà anonymisé.' using errcode = '23514';
  end if;
  if profile.is_active then
    raise exception 'Seul un compte déjà désactivé peut être anonymisé.' using errcode = '42501';
  end if;

  update public.profiles
  set full_name = private.anonymous_profile_name(target),
      email = private.anonymous_profile_email(target),
      anonymized_at = now(),
      sessions_revoked_at = date_trunc('second', now())
  where id = target;

  -- Les participations internes portent une copie du nom et de l'e-mail.
  update public.visit_participants
  set full_name = private.anonymous_profile_name(target),
      email = null
  where profile_id = target;

  perform private.audit('profile.anonymized', 'profile', target, '{}'::jsonb, actor);
end
$$;

comment on function private.anonymize_profile(uuid, uuid) is
  'RGPD : anonymise un compte déjà désactivé (profil et participations internes). Irréversible. Service uniquement.';
revoke execute on function private.anonymize_profile(uuid, uuid) from public, anon, authenticated;
grant execute on function private.anonymize_profile(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. E-mails des responsables externes des réserves levées depuis plus de N mois
-- ---------------------------------------------------------------------------
create or replace function private.clear_external_responsible_emails(months integer, apply boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if months is null or months < 1 then
    raise exception 'Le délai doit être d''au moins un mois.' using errcode = '22023';
  end if;
  if apply then
    update public.reserves
    set responsible_email = null
    where responsible_email is not null
      and status = 'done'
      and closed_at < now() - make_interval(months => months);
    get diagnostics affected = row_count;
    perform private.audit('rgpd.external_emails_cleared', 'system', null,
      jsonb_build_object('months', months, 'count', affected));
  else
    select count(*) into affected
    from public.reserves
    where responsible_email is not null
      and status = 'done'
      and closed_at < now() - make_interval(months => months);
  end if;
  return affected;
end
$$;

comment on function private.clear_external_responsible_emails(integer, boolean) is
  'RGPD : efface l''e-mail des responsables externes des réserves levées depuis plus de N mois (apply = false : simulation, compte seulement).';
revoke execute on function private.clear_external_responsible_emails(integer, boolean) from public, anon, authenticated;
grant execute on function private.clear_external_responsible_emails(integer, boolean) to service_role;
