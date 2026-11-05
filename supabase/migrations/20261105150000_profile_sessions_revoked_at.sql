-- Migration 18 : révocation des sessions d'un compte (étape 11, sécurité).
--
-- « Déconnecter toutes les sessions » (admin) et la désactivation d'un compte posent
-- profiles.sessions_revoked_at ; à chaque requête, l'application refuse une session ouverte
-- avant cette date (heure de connexion : claim `auth_time` du jeton local, `amr` du jeton
-- Supabase, conservé au rafraîchissement). La date est tronquée à la seconde : les horodatages
-- `amr` de Supabase sont en secondes.

alter table public.profiles
  add column if not exists sessions_revoked_at timestamptz;

comment on column public.profiles.sessions_revoked_at is
  'Sessions ouvertes avant cette date refusées (déconnexion de toutes les sessions, désactivation). Réservée au service.';

-- Aucune colonne de plus n'est lisible ni modifiable par `authenticated` (privilèges de colonnes
-- de la migration 5 inchangés).

-- Colonnes réservées au service : on ajoute sessions_revoked_at.
create or replace function private.protect_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.role, new.is_active, new.email, new.must_change_password, new.sessions_revoked_at)
     is distinct from
     (old.role, old.is_active, old.email, old.must_change_password, old.sessions_revoked_at)
     and current_user not in ('service_role', 'postgres')
  then
    raise exception 'Seul le service peut modifier le rôle, l''activation, l''email, l''état du mot de passe ou les sessions.'
      using errcode = '42501';
  end if;
  if new.id <> old.id then
    raise exception 'L''identifiant d''un profil est immuable.' using errcode = '42501';
  end if;
  -- Désactiver un compte coupe ses sessions : une réactivation ne les rend pas valides.
  if old.is_active and not new.is_active then
    new.sessions_revoked_at := date_trunc('second', now());
  end if;
  return new;
end
$$;

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
  if new.sessions_revoked_at is distinct from old.sessions_revoked_at
     and new.sessions_revoked_at is not null then
    perform private.audit('profile.sessions_revoked', 'profile', new.id,
      jsonb_build_object('reason', case when new.is_active then 'admin' else 'deactivated' end));
  end if;
  return new;
end
$$;

-- Audit RLS (étape 11) : les vues `security_invoker` ne s'ouvrent qu'en lecture, et jamais à
-- `anon` (qui ne lisait rien, faute de droit sur les tables, mais le droit était inutile).
revoke all on public.visit_summaries, public.reserves_with_state from anon, authenticated;
grant select on public.visit_summaries, public.reserves_with_state to authenticated, service_role;
