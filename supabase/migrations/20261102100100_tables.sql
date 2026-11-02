-- Étape 2 · migration 2 : tables, contraintes, index et commentaires.
-- Les valeurs dérivées (retard, compteurs) ne sont jamais stockées : voir les vues (migration 3).

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null check (char_length(full_name) between 1 and 200),
  role public.user_role not null default 'rt',
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Un profil applicatif par utilisateur Supabase Auth. Créé et désactivé par l''admin (service), jamais supprimé.';
comment on column public.profiles.role is 'rt, direction ou admin. Modifiable uniquement par le service.';
comment on column public.profiles.is_active is 'Un profil inactif ne voit rien. Modifiable uniquement par le service.';
comment on column public.profiles.must_change_password is 'Vrai tant que l''utilisateur n''a pas remplacé le mot de passe initial.';

-- ---------------------------------------------------------------------------
-- sites (référentiel VIGIE, lecture seule pour les utilisateurs)
-- ---------------------------------------------------------------------------
create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  warehouse_code text not null unique check (char_length(warehouse_code) between 1 and 32),
  name text not null check (char_length(name) between 1 and 200),
  address text,
  postal_code text,
  city text,
  surface_m2 numeric(12, 2) check (surface_m2 is null or surface_m2 >= 0),
  category text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  is_active boolean not null default true,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.sites is 'Référentiel des entrepôts, importé du CSV VIGIE (étape 4). Jamais modifié par les utilisateurs.';
comment on column public.sites.warehouse_code is 'Code entrepôt VIGIE, identifiant métier unique.';
comment on column public.sites.is_active is 'Un site disparu de VIGIE est désactivé, jamais supprimé : ses visites restent lisibles.';
comment on column public.sites.imported_at is 'Date du dernier import VIGIE ayant touché cette ligne.';

create index if not exists sites_name_trgm_idx on public.sites using gin (name extensions.gin_trgm_ops);
create index if not exists sites_city_trgm_idx on public.sites using gin (city extensions.gin_trgm_ops);
create index if not exists sites_warehouse_code_trgm_idx on public.sites using gin (warehouse_code extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- site_import_runs
-- ---------------------------------------------------------------------------
create table if not exists public.site_import_runs (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  mode public.import_mode not null,
  rows_total integer not null default 0 check (rows_total >= 0),
  rows_created integer not null default 0 check (rows_created >= 0),
  rows_updated integer not null default 0 check (rows_updated >= 0),
  rows_deactivated integer not null default 0 check (rows_deactivated >= 0),
  rows_rejected integer not null default 0 check (rows_rejected >= 0),
  errors jsonb not null default '[]'::jsonb,
  performed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.site_import_runs is 'Journal des imports VIGIE (simulation ou application), écrit par le service.';
comment on column public.site_import_runs.errors is 'Liste JSON des lignes rejetées avec leur motif.';

-- ---------------------------------------------------------------------------
-- visits
-- ---------------------------------------------------------------------------
create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete restrict,
  type public.visit_type not null default 'technical',
  reason public.visit_reason not null default 'periodic',
  title text not null check (char_length(title) between 1 and 200),
  visit_date date not null,
  subject text check (subject is null or char_length(subject) <= 2000),
  writer_id uuid references public.profiles (id) on delete set null,
  status public.visit_status not null default 'in_progress',
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  duplicated_from_id uuid references public.visits (id) on delete set null,
  version integer not null default 1 check (version >= 1),
  created_by uuid not null references public.profiles (id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visits_completed_consistency check (
    (status = 'completed' and completed_at is not null) or (status = 'in_progress' and completed_at is null)
  )
);
comment on table public.visits is 'Visite de site. Suppression logique uniquement (deleted_at), statut géré par RPC.';
comment on column public.visits.site_id is 'Site du référentiel, obligatoire et immuable après création.';
comment on column public.visits.subject is 'Objet de la visite, texte libre.';
comment on column public.visits.writer_id is 'Rédacteur du compte rendu (peut différer du créateur).';
comment on column public.visits.duplicated_from_id is 'Visite d''origine quand la visite a été créée par duplication.';
comment on column public.visits.version is 'Incrémenté à chaque mise à jour par trigger ; servira à détecter les conflits hors réseau (phase 2).';
comment on column public.visits.deleted_at is 'Suppression logique, tracée dans audit_log. Les visites supprimées ne sont visibles que par l''admin.';

create index if not exists visits_site_date_idx on public.visits (site_id, visit_date desc);
create index if not exists visits_created_by_idx on public.visits (created_by);
create index if not exists visits_writer_idx on public.visits (writer_id);

-- ---------------------------------------------------------------------------
-- visit_participants
-- ---------------------------------------------------------------------------
create table if not exists public.visit_participants (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  full_name text not null check (char_length(full_name) between 1 and 200),
  company text,
  job_title text,
  email text check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  is_present boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.visit_participants is 'Participants d''une visite, internes (avec profil) ou externes.';
comment on column public.visit_participants.profile_id is 'Profil RONDE du participant interne ; donne le droit de modifier la visite.';
create index if not exists visit_participants_visit_idx on public.visit_participants (visit_id);
create index if not exists visit_participants_profile_idx on public.visit_participants (profile_id);

-- ---------------------------------------------------------------------------
-- visit_zone_notes
-- ---------------------------------------------------------------------------
create table if not exists public.visit_zone_notes (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits (id) on delete cascade,
  zone_key text not null check (zone_key ~ '^[a-z0-9_-]{1,64}$'),
  zone_label text not null check (char_length(zone_label) between 1 and 120),
  sort_order integer not null default 0,
  content text not null default '' check (char_length(content) <= 20000),
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (visit_id, zone_key)
);
comment on table public.visit_zone_notes is 'Notes par zone d''une visite. La trame des zones est une constante applicative (src/server/domain/templates.ts).';
comment on column public.visit_zone_notes.zone_key is 'Clé de zone : une clé de la trame, ou custom-… pour une zone ajoutée.';
create index if not exists visit_zone_notes_visit_idx on public.visit_zone_notes (visit_id);

-- ---------------------------------------------------------------------------
-- photos
-- ---------------------------------------------------------------------------
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits (id) on delete cascade,
  storage_path text not null unique,
  original_filename text,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  size_bytes bigint check (size_bytes is null or size_bytes > 0),
  caption text check (caption is null or char_length(caption) <= 500),
  category text,
  zone_key text check (zone_key is null or zone_key ~ '^[a-z0-9_-]{1,64}$'),
  taken_at timestamptz,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.photos is 'Photos d''une visite, stockées dans le bucket privé visit-photos.';
comment on column public.photos.storage_path is 'Chemin dans le bucket : {visit_id}/{photo_id}.{ext}.';
comment on column public.photos.is_cover is 'Photo de garde du rapport : au plus une par visite.';
create index if not exists photos_visit_idx on public.photos (visit_id);
create unique index if not exists photos_one_cover_per_visit_idx on public.photos (visit_id) where is_cover;

-- ---------------------------------------------------------------------------
-- site_plans (rattachés au site, réutilisés de visite en visite)
-- ---------------------------------------------------------------------------
create table if not exists public.site_plans (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 200),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg')),
  page_count integer not null default 1 check (page_count >= 1),
  is_archived boolean not null default false,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.site_plans is 'Plans (export AutoCAD en PDF ou image) rattachés au site. Archivés, jamais supprimés.';
comment on column public.site_plans.storage_path is 'Chemin dans le bucket site-plans : {site_id}/{plan_id}.{ext}.';
create index if not exists site_plans_site_idx on public.site_plans (site_id);

-- ---------------------------------------------------------------------------
-- plan_markers
-- ---------------------------------------------------------------------------
create table if not exists public.plan_markers (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits (id) on delete cascade,
  plan_id uuid not null references public.site_plans (id) on delete restrict,
  page integer not null default 1 check (page >= 1),
  x numeric(6, 5) not null check (x >= 0 and x <= 1),
  y numeric(6, 5) not null check (y >= 0 and y <= 1),
  number integer not null check (number >= 1),
  label text check (label is null or char_length(label) <= 200),
  photo_id uuid references public.photos (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (visit_id, plan_id, number)
);
comment on table public.plan_markers is 'Repères posés sur un plan pendant une visite, en coordonnées relatives (0 à 1).';
comment on column public.plan_markers.number is 'Numéro affiché, unique par visite et par plan.';
create index if not exists plan_markers_visit_idx on public.plan_markers (visit_id);

-- ---------------------------------------------------------------------------
-- reserves
-- ---------------------------------------------------------------------------
create table if not exists public.reserves (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete restrict,
  number integer not null check (number >= 1),
  action text not null check (char_length(action) between 1 and 500),
  description text check (description is null or char_length(description) <= 5000),
  zone_key text check (zone_key is null or zone_key ~ '^[a-z0-9_-]{1,64}$'),
  priority public.reserve_priority not null default 'normal',
  responsible_kind public.responsible_kind not null default 'internal',
  responsible_profile_id uuid references public.profiles (id) on delete set null,
  responsible_name text check (responsible_name is null or char_length(responsible_name) <= 200),
  responsible_company text check (responsible_company is null or char_length(responsible_company) <= 200),
  responsible_email text check (
    responsible_email is null or responsible_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  due_date date,
  status public.reserve_status not null default 'open',
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, number),
  constraint reserves_responsible_consistency check (
    (responsible_kind = 'internal' and responsible_profile_id is not null)
    or (responsible_kind = 'external' and responsible_name is not null and char_length(responsible_name) >= 1)
  )
);
comment on table public.reserves is 'Réserves relevées en visite. Numérotées par site par trigger, suppression logique uniquement.';
comment on column public.reserves.site_id is 'Toujours égal à visits.site_id : rempli et vérifié par trigger.';
comment on column public.reserves.number is 'Numéro séquentiel par site, attribué par trigger sous verrou consultatif ; affiché R-07.';
comment on column public.reserves.closed_at is 'Renseigné par trigger au passage à done, vidé en cas de retour.';
comment on column public.reserves.due_date is 'Échéance. Le retard est calculé à la lecture (vue reserves_with_state), jamais stocké.';
create index if not exists reserves_visit_idx on public.reserves (visit_id);
create index if not exists reserves_site_idx on public.reserves (site_id);
create index if not exists reserves_status_due_idx on public.reserves (status, due_date) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- reserve_photos
-- ---------------------------------------------------------------------------
create table if not exists public.reserve_photos (
  reserve_id uuid not null references public.reserves (id) on delete cascade,
  photo_id uuid not null references public.photos (id) on delete cascade,
  kind public.photo_kind not null default 'defect',
  created_at timestamptz not null default now(),
  primary key (reserve_id, photo_id)
);
comment on table public.reserve_photos is 'Lien entre une réserve et ses photos (défaut ou preuve de levée).';

-- ---------------------------------------------------------------------------
-- reserve_events (ajout seul)
-- ---------------------------------------------------------------------------
create table if not exists public.reserve_events (
  id uuid primary key default gen_random_uuid(),
  reserve_id uuid not null references public.reserves (id) on delete cascade,
  event_type public.reserve_event_type not null,
  from_status public.reserve_status,
  to_status public.reserve_status,
  changes jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.reserve_events is 'Historique des réserves, en ajout seul, alimenté uniquement par trigger.';
comment on column public.reserve_events.changes is 'Champs modifiés : { "champ": { "old": …, "new": … } }.';
create index if not exists reserve_events_reserve_idx on public.reserve_events (reserve_id, created_at);

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits (id) on delete cascade,
  storage_path text not null unique,
  size_bytes bigint check (size_bytes is null or size_bytes > 0),
  options jsonb not null default '{}'::jsonb,
  generated_by uuid references public.profiles (id) on delete set null,
  generated_at timestamptz not null default now()
);
comment on table public.reports is 'Rapports PDF générés. Jamais modifiés ; supprimés uniquement avec la visite.';
comment on column public.reports.options is 'Options de génération : rubriques, photo de garde, photos par page, qualité.';
create index if not exists reports_visit_idx on public.reports (visit_id, generated_at desc);

-- ---------------------------------------------------------------------------
-- audit_log (ajout seul, jamais supprimé)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb
);
comment on table public.audit_log is 'Journal d''audit en ajout seul, alimenté uniquement par trigger et par les RPC.';
comment on column public.audit_log.actor_id is 'auth.uid() de l''acteur, ou null pour une opération système.';
comment on column public.audit_log.action is 'Action au format entité.verbe, par exemple visit.created ou reserve.status_changed.';
create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id, occurred_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, occurred_at desc);
