-- Étape 2 · migration 1 : extensions et types énumérés.
-- Règle : ne jamais modifier une migration commitée ; corriger par une nouvelle migration.

create extension if not exists pg_trgm with schema extensions;

-- Schéma des fonctions d'autorisation et des utilitaires internes (voir migration 4).
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('rt', 'direction', 'admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'visit_type') then
    create type public.visit_type as enum ('technical', 'meeting');
  end if;
  if not exists (select 1 from pg_type where typname = 'visit_reason') then
    create type public.visit_reason as enum (
      'periodic', 'lease_negotiation', 'post_claim', 'tenant_entry', 'tenant_exit', 'meeting'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'visit_status') then
    create type public.visit_status as enum ('in_progress', 'completed');
  end if;
  if not exists (select 1 from pg_type where typname = 'reserve_priority') then
    create type public.reserve_priority as enum ('low', 'normal', 'high', 'urgent');
  end if;
  if not exists (select 1 from pg_type where typname = 'reserve_status') then
    create type public.reserve_status as enum ('open', 'in_progress', 'done');
  end if;
  if not exists (select 1 from pg_type where typname = 'responsible_kind') then
    create type public.responsible_kind as enum ('internal', 'external');
  end if;
  if not exists (select 1 from pg_type where typname = 'photo_kind') then
    create type public.photo_kind as enum ('defect', 'proof');
  end if;
  if not exists (select 1 from pg_type where typname = 'reserve_event_type') then
    create type public.reserve_event_type as enum ('created', 'updated', 'status_changed', 'deleted');
  end if;
  if not exists (select 1 from pg_type where typname = 'import_mode') then
    create type public.import_mode as enum ('simulate', 'apply');
  end if;
end
$$;

comment on type public.user_role is 'Rôle applicatif : rt (saisie), direction (lecture seule), admin (comptes).';
comment on type public.visit_type is 'Nature de la visite : technique ou réunion.';
comment on type public.visit_reason is 'Motif de la visite (périodique, négociation de bail, après sinistre, entrée ou sortie de locataire, réunion).';
comment on type public.visit_status is 'Cycle de vie d''une visite : en cours puis terminée (réouverture possible par RPC).';
comment on type public.reserve_priority is 'Priorité d''une réserve : Basse, Normale, Haute, Urgente.';
comment on type public.reserve_status is 'Statut d''une réserve : Ouverte, En cours, Levée.';
comment on type public.responsible_kind is 'Responsable d''une réserve : interne (profil) ou externe (nom libre).';
comment on type public.photo_kind is 'Lien réserve-photo : photo du défaut ou preuve de levée.';
comment on type public.reserve_event_type is 'Type d''événement de l''historique des réserves.';
comment on type public.import_mode is 'Mode d''un import VIGIE : simulation ou application.';
