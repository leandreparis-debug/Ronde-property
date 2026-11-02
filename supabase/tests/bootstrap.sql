-- =============================================================================
-- RONDE — bootstrap de la base de TEST (ronde_test) sur un PostgreSQL nu.
--
-- Ce script émule le strict nécessaire de Supabase pour exécuter les migrations
-- et les tests d'autorisation sans la plateforme : les rôles, le schéma auth
-- (auth.users, auth.uid(), auth.jwt(), auth.role()), le schéma storage
-- (buckets, objects, foldername()) et le schéma extensions.
--
-- IL NE DOIT JAMAIS ÊTRE EXÉCUTÉ SUR UN VRAI PROJET SUPABASE : la plateforme
-- fournit déjà tout cela. Il est appliqué uniquement par `pnpm db:reset`,
-- qui refuse toute base autre que `ronde_test` sur localhost.
-- =============================================================================

-- Rôles Supabase. `service_role` contourne la RLS, comme sur la plateforme.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- Schéma des extensions (Supabase y installe pg_trgm, etc.).
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- auth
-- ---------------------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Les claims JWT sont lus dans `request.jwt.claims`, positionné par PostgREST
-- sur la plateforme et par `set_config()` dans les tests.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- storage
-- ---------------------------------------------------------------------------
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name text not null,
  owner uuid,
  owner_id text,
  metadata jsonb,
  version text,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  select string_to_array(name, '/') into parts;
  return parts[1 : array_length(parts, 1) - 1];
end
$$;

create or replace function storage.filename(name text)
returns text
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  select string_to_array(name, '/') into parts;
  return parts[array_length(parts, 1)];
end
$$;

create or replace function storage.extension(name text)
returns text
language plpgsql
immutable
as $$
declare
  filename text;
begin
  filename := storage.filename(name);
  return reverse(split_part(reverse(filename), '.', 1));
end
$$;

grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
grant execute on function storage.foldername(text), storage.filename(text), storage.extension(text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public : mêmes privilèges par défaut que sur la plateforme.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
