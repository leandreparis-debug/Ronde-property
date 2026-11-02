-- Étape 2 · migration 4 : fonctions d'autorisation (schéma private) et RPC de cycle de vie des visites.
-- Toutes les fonctions security definer fixent search_path = '' et qualifient les noms.

-- ---------------------------------------------------------------------------
-- Utilitaires internes
-- ---------------------------------------------------------------------------

-- Conversion sûre d'un texte en uuid (chemins Storage).
create or replace function private.try_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when others then
  return null;
end
$$;

-- Écriture dans audit_log. Seul chemin d'écriture autorisé : le trigger de garde
-- (migration 6) refuse toute insertion sans le marqueur ronde.internal_write.
create or replace function private.audit(
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb default '{}'::jsonb,
  actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('ronde.internal_write', '1', true);
  insert into public.audit_log (actor_id, action, entity_type, entity_id, details)
  values (coalesce(actor_id, auth.uid()), action, entity_type, entity_id, coalesce(details, '{}'::jsonb));
  perform set_config('ronde.internal_write', '', true);
end
$$;
revoke execute on function private.audit(text, text, uuid, jsonb, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rôle courant
-- ---------------------------------------------------------------------------
create or replace function private.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.is_active
$$;
comment on function private.current_role() is 'Rôle du profil actif de auth.uid(), sinon null (inactif, sans profil ou anonyme).';

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_role() is not null
$$;

create or replace function private.is_rt_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_role() in ('rt', 'admin')
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_role() = 'admin'
$$;

-- ---------------------------------------------------------------------------
-- Droits sur une visite
-- ---------------------------------------------------------------------------

-- Lecture : utilisateur actif ; les visites supprimées ne sont visibles que par l'admin.
create or replace function private.can_read_visit(visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user()
    and exists (
      select 1
      from public.visits v
      where v.id = visit_id
        and (v.deleted_at is null or private.is_admin())
    )
$$;

-- Modification : rt ou admin actif, visite non supprimée et en cours ; l'utilisateur est le
-- créateur, le rédacteur ou un participant lié à son profil. L'admin peut toujours modifier.
create or replace function private.can_edit_visit(visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_rt_or_admin()
    and exists (
      select 1
      from public.visits v
      where v.id = visit_id
        and v.deleted_at is null
        and v.status = 'in_progress'
        and (
          private.is_admin()
          or v.created_by = auth.uid()
          or v.writer_id = auth.uid()
          or exists (
            select 1
            from public.visit_participants vp
            where vp.visit_id = v.id and vp.profile_id = auth.uid()
          )
        )
    )
$$;

-- Réouverture et suppression : créateur, rédacteur ou admin, sur une visite non supprimée.
create or replace function private.can_manage_visit(visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_rt_or_admin()
    and exists (
      select 1
      from public.visits v
      where v.id = visit_id
        and v.deleted_at is null
        and (private.is_admin() or v.created_by = auth.uid() or v.writer_id = auth.uid())
    )
$$;

grant execute on function
  private.try_uuid(text),
  private.current_role(),
  private.is_active_user(),
  private.is_rt_or_admin(),
  private.is_admin(),
  private.can_read_visit(uuid),
  private.can_edit_visit(uuid),
  private.can_manage_visit(uuid)
to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC de cycle de vie. Les colonnes status / completed_* / deleted_* ne sont
-- modifiables que par ces fonctions (marqueur ronde.rpc vérifié par trigger).
-- ---------------------------------------------------------------------------
create or replace function public.complete_visit(visit_id uuid)
returns public.visits
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.visits;
begin
  if not private.can_edit_visit(visit_id) then
    raise exception 'Clôture refusée : la visite n''est pas modifiable par cet utilisateur.'
      using errcode = '42501';
  end if;

  perform set_config('ronde.rpc', '1', true);
  update public.visits
  set status = 'completed', completed_at = now(), completed_by = auth.uid()
  where id = visit_id
  returning * into result;
  perform set_config('ronde.rpc', '', true);

  perform private.audit('visit.completed', 'visit', visit_id, jsonb_build_object('version', result.version));
  return result;
end
$$;
comment on function public.complete_visit(uuid) is 'Termine une visite en cours. Réservé à qui peut la modifier. Tracé dans audit_log.';

create or replace function public.reopen_visit(visit_id uuid)
returns public.visits
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.visits;
begin
  if not private.can_manage_visit(visit_id) then
    raise exception 'Réouverture refusée : réservée au créateur, au rédacteur ou à un admin.'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.visits v where v.id = visit_id and v.status = 'completed') then
    raise exception 'Réouverture impossible : la visite n''est pas terminée.' using errcode = '22023';
  end if;

  perform set_config('ronde.rpc', '1', true);
  update public.visits
  set status = 'in_progress', completed_at = null, completed_by = null
  where id = visit_id
  returning * into result;
  perform set_config('ronde.rpc', '', true);

  perform private.audit('visit.reopened', 'visit', visit_id, jsonb_build_object('version', result.version));
  return result;
end
$$;
comment on function public.reopen_visit(uuid) is 'Rouvre une visite terminée. Réservé au créateur, au rédacteur ou à un admin. Tracé.';

create or replace function public.soft_delete_visit(visit_id uuid)
returns public.visits
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.visits;
begin
  if not private.can_manage_visit(visit_id) then
    raise exception 'Suppression refusée : réservée au créateur, au rédacteur ou à un admin.'
      using errcode = '42501';
  end if;

  perform set_config('ronde.rpc', '1', true);
  update public.visits
  set deleted_at = now(), deleted_by = auth.uid()
  where id = visit_id
  returning * into result;
  perform set_config('ronde.rpc', '', true);

  perform private.audit('visit.deleted', 'visit', visit_id, jsonb_build_object('title', result.title));
  return result;
end
$$;
comment on function public.soft_delete_visit(uuid) is 'Suppression logique d''une visite. Réservée au créateur, au rédacteur ou à un admin. Tracée.';

revoke execute on function public.complete_visit(uuid), public.reopen_visit(uuid), public.soft_delete_visit(uuid)
  from public, anon;
grant execute on function public.complete_visit(uuid), public.reopen_visit(uuid), public.soft_delete_visit(uuid)
  to authenticated, service_role;
