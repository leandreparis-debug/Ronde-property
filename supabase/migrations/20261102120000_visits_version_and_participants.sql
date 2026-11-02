-- Étape 5 · migration 11 : concurrence optimiste des visites et participants.
--
--   1. visits.updated_by : auteur de la dernière modification (message de conflit) ;
--   2. les modifications de participants touchent la visite parente (version +1, updated_by),
--      par trigger, pour que tout chemin d'écriture (interface, synchronisation future) soit couvert ;
--   3. un même profil ne peut pas être ajouté deux fois à une visite.

alter table public.visits
  add column if not exists updated_by uuid references public.profiles (id) on delete restrict;
comment on column public.visits.updated_by is 'auth.uid() de la dernière modification (null pour le système) ; affiché dans le message de conflit de version.';

-- Même logique que la migration 6, plus updated_by.
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
  new.updated_by := auth.uid();
  return new;
end
$$;

-- Même logique que la migration 6, en ignorant aussi updated_by.
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

  diff := private.jsonb_diff(
    to_jsonb(old), to_jsonb(new),
    array['updated_at', 'updated_by', 'version', 'status', 'completed_at', 'completed_by', 'deleted_at', 'deleted_by']
  );
  if diff <> '{}'::jsonb then
    perform private.audit('visit.updated', 'visit', new.id, jsonb_build_object('changes', diff));
  end if;
  return new;
end
$$;

-- Toute écriture sur une table fille touche la visite parente (version, updated_at, updated_by).
create or replace function private.touch_parent_visit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  target := coalesce(new.visit_id, old.visit_id);
  update public.visits set updated_at = now() where id = target;
  return coalesce(new, old);
end
$$;

drop trigger if exists touch_parent_visit on public.visit_participants;
create trigger touch_parent_visit
  after insert or update or delete on public.visit_participants
  for each row execute function private.touch_parent_visit();

create unique index if not exists visit_participants_unique_profile_idx
  on public.visit_participants (visit_id, profile_id)
  where profile_id is not null;
