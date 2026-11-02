-- Étape 4 · migration 10 : recherche insensible aux accents et empreinte des imports.

create extension if not exists unaccent with schema extensions;

-- unaccent() est stable (dictionnaire) ; cette enveloppe immutable, avec le dictionnaire
-- explicite, permet de l'indexer. Minuscules + accents retirés.
create or replace function private.search_text(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(value, '')))
$$;
comment on function private.search_text(text) is 'Texte normalisé pour la recherche : minuscules, sans accents.';
grant execute on function private.search_text(text) to anon, authenticated, service_role;

-- Expression de recherche d'un site : nom, code et ville.
create or replace function private.site_search_text(name text, warehouse_code text, city text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select private.search_text(coalesce(name, '') || ' ' || coalesce(warehouse_code, '') || ' ' || coalesce(city, ''))
$$;
grant execute on function private.site_search_text(text, text, text) to anon, authenticated, service_role;

create index if not exists sites_search_text_trgm_idx
  on public.sites using gin (private.site_search_text(name, warehouse_code, city) extensions.gin_trgm_ops);

-- Traçabilité des imports : empreinte SHA-256 du fichier (le contenu n'est jamais conservé)
-- et options choisies.
alter table public.site_import_runs
  add column if not exists file_sha256 text,
  add column if not exists options jsonb not null default '{}'::jsonb;
comment on column public.site_import_runs.file_sha256 is 'Empreinte SHA-256 du fichier importé ; le fichier lui-même n''est pas conservé.';
comment on column public.site_import_runs.options is 'Options de l''import : fullReferential, emptyClearsValue, encodage et séparateur détectés.';
