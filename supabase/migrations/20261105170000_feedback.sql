-- Migration 20 : avis des utilisateurs du pilote (« Donner mon avis », étape 11).
--
-- Note de 1 à 5 obligatoire, « Ce qui marche » et « Ce qui bloque » facultatifs, page concernée
-- remplie par l'application. Insertion par tout utilisateur actif (pour lui-même), lecture par
-- l'admin seulement ; un avis ne se modifie ni ne se supprime.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  works text check (works is null or char_length(works) between 1 and 2000),
  blocks text check (blocks is null or char_length(blocks) between 1 and 2000),
  page_path text not null check (page_path ~ '^/' and char_length(page_path) <= 300),
  app_version text not null check (char_length(app_version) between 1 and 20),
  viewport text check (viewport is null or viewport ~ '^[0-9]{2,5}x[0-9]{2,5}$'),
  created_at timestamptz not null default now()
);

comment on table public.feedback is
  'Avis du pilote (« Donner mon avis ») : note 1 à 5, ce qui marche, ce qui bloque, page concernée. Lecture admin.';
comment on column public.feedback.page_path is
  'Chemin de la page d''où l''avis est donné, sans paramètres de requête.';
comment on column public.feedback.viewport is
  'Taille de l''écran (largeur x hauteur en px CSS) : distingue tablette et PC.';

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
create index if not exists feedback_author_idx on public.feedback (author_id);

alter table public.feedback enable row level security;

drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback
  for insert to authenticated
  with check (author_id = auth.uid() and private.is_active_user());

drop policy if exists feedback_select_admin on public.feedback;
create policy feedback_select_admin on public.feedback
  for select to authenticated
  using (private.current_role() = 'admin');

-- Droits par défaut du schéma retirés (dont TRUNCATE, qui ignore la RLS), puis le strict
-- nécessaire. Un RT n'a pas SELECT : son insertion ne peut pas utiliser RETURNING.
revoke all on public.feedback from anon, authenticated;
grant select, insert on public.feedback to authenticated;
grant select, insert on public.feedback to service_role;

-- Un avis ne se modifie ni ne se supprime (ni update ni delete : aucun droit, aucune politique).
