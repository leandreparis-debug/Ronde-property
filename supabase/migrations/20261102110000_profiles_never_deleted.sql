-- Étape 4 · migration 9 : un compte ne se supprime jamais, il se désactive.
--
-- Les tables d'historique pointent vers profiles avec `on delete restrict` : la suppression
-- d'un profil référencé échouait déjà (la garde « ajout seul » bloquait le `set null`), mais
-- avec un message obscur. Un trigger before delete rend la règle explicite, y compris en
-- cascade depuis auth.users (suppression depuis le tableau de bord Supabase).
-- Anonymisation RGPD (nom et email remplacés) prévue à l'étape 11.

alter table public.audit_log
  drop constraint if exists audit_log_actor_id_fkey,
  add constraint audit_log_actor_id_fkey
    foreign key (actor_id) references public.profiles (id) on delete restrict;

alter table public.reserve_events
  drop constraint if exists reserve_events_actor_id_fkey,
  add constraint reserve_events_actor_id_fkey
    foreign key (actor_id) references public.profiles (id) on delete restrict;

alter table public.reports
  drop constraint if exists reports_generated_by_fkey,
  add constraint reports_generated_by_fkey
    foreign key (generated_by) references public.profiles (id) on delete restrict;

alter table public.site_import_runs
  drop constraint if exists site_import_runs_performed_by_fkey,
  add constraint site_import_runs_performed_by_fkey
    foreign key (performed_by) references public.profiles (id) on delete restrict;

create or replace function private.reject_profile_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'RONDE: un compte ne se supprime pas, il se désactive (historique attribué)'
    using errcode = '42501';
end
$$;

drop trigger if exists profiles_never_deleted on public.profiles;
create trigger profiles_never_deleted
  before delete on public.profiles
  for each row execute function private.reject_profile_delete();

comment on table public.profiles is 'Un profil applicatif par utilisateur Supabase Auth. Créé et désactivé par l''admin (service), jamais supprimé (trigger profiles_never_deleted).';
