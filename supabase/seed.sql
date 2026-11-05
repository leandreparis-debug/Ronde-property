-- =============================================================================
-- RONDE — données FICTIVES pour la base locale ou de test uniquement.
-- Ne jamais exécuter sur le vrai projet Supabase. Aucun fichier n'est créé dans Storage.
-- Tous les sites, personnes, adresses et entreprises sont inventés.
-- =============================================================================

begin;

-- Garde : la seed ne s'applique qu'à la base locale ronde_test. Une base Supabase s'appelle
-- « postgres » : même `supabase db push --include-seed` (à ne jamais utiliser) échouerait ici.
do $$
begin
  if current_database() <> 'ronde_test' then
    raise exception 'RONDE : la seed fictive ne s''applique qu''à la base locale ronde_test (base actuelle : %).',
      current_database();
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Utilisateurs (auth.users + profiles). Emails en @example.test, UUID fixes.
-- ---------------------------------------------------------------------------
-- Mot de passe LOCAL commun à tous les comptes fictifs : Ronde-test-2026
-- (hash bcrypt, fournisseur d'authentification `local` uniquement, jamais sur Supabase).
insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000001', 'rt.alice@example.test', '$2b$10$nS1FlMzYImEBuh7tbBJzOODPJQTeJppJEno0ktoTI/snCYmeDukNC', now()),
  ('00000000-0000-4000-8000-000000000002', 'rt.bruno@example.test', '$2b$10$nS1FlMzYImEBuh7tbBJzOODPJQTeJppJEno0ktoTI/snCYmeDukNC', now()),
  ('00000000-0000-4000-8000-000000000003', 'direction.claire@example.test', '$2b$10$nS1FlMzYImEBuh7tbBJzOODPJQTeJppJEno0ktoTI/snCYmeDukNC', now()),
  ('00000000-0000-4000-8000-000000000004', 'admin.david@example.test', '$2b$10$nS1FlMzYImEBuh7tbBJzOODPJQTeJppJEno0ktoTI/snCYmeDukNC', now()),
  ('00000000-0000-4000-8000-000000000005', 'rt.inactif@example.test', '$2b$10$nS1FlMzYImEBuh7tbBJzOODPJQTeJppJEno0ktoTI/snCYmeDukNC', now()),
  ('00000000-0000-4000-8000-000000000006', 'rt.emma@example.test', '$2b$10$nS1FlMzYImEBuh7tbBJzOODPJQTeJppJEno0ktoTI/snCYmeDukNC', now())
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role, is_active, must_change_password) values
  ('00000000-0000-4000-8000-000000000001', 'rt.alice@example.test', 'Alice Fictive', 'rt', true, false),
  ('00000000-0000-4000-8000-000000000002', 'rt.bruno@example.test', 'Bruno Fictif', 'rt', true, false),
  ('00000000-0000-4000-8000-000000000003', 'direction.claire@example.test', 'Claire Fictive', 'direction', true, false),
  ('00000000-0000-4000-8000-000000000004', 'admin.david@example.test', 'David Fictif', 'admin', true, false),
  ('00000000-0000-4000-8000-000000000005', 'rt.inactif@example.test', 'Inactif Fictif', 'rt', false, true),
  ('00000000-0000-4000-8000-000000000006', 'rt.emma@example.test', 'Emma Fictive', 'rt', true, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 12 sites fictifs (TEST-001 à TEST-012). TEST-012 est inactif.
-- ---------------------------------------------------------------------------
insert into public.sites (id, warehouse_code, name, address, postal_code, city, surface_m2, category, latitude, longitude, is_active, imported_at) values
  ('10000000-0000-4000-8000-000000000001', 'TEST-001', 'Entrepôt fictif Lyon Sud', '1 rue Imaginaire', '69800', 'Saint-Priest', 42000.00, 'Logistique sèche', 45.70, 4.95, true, now()),
  ('10000000-0000-4000-8000-000000000002', 'TEST-002', 'Entrepôt fictif Lille Nord', '2 avenue Inventée', '59160', 'Lille', 28500.50, 'Logistique sèche', 50.65, 3.05, true, now()),
  ('10000000-0000-4000-8000-000000000003', 'TEST-003', 'Plateforme fictive Marseille', '3 chemin Fictif', '13015', 'Marseille', 61000.00, 'Multi-température', 43.35, 5.37, true, now()),
  ('10000000-0000-4000-8000-000000000004', 'TEST-004', 'Entrepôt fictif Toulouse Est', '4 impasse Simulée', '31200', 'Toulouse', 19800.00, 'Logistique sèche', 43.63, 1.47, true, now()),
  ('10000000-0000-4000-8000-000000000005', 'TEST-005', 'Entrepôt fictif Nantes Ouest', '5 route Imaginée', '44800', 'Saint-Herblain', 33500.00, 'Frais', 47.22, -1.63, true, now()),
  ('10000000-0000-4000-8000-000000000006', 'TEST-006', 'Plateforme fictive Bordeaux', '6 allée Fictive', '33300', 'Bordeaux', 54000.00, 'Logistique sèche', 44.87, -0.56, true, now()),
  ('10000000-0000-4000-8000-000000000007', 'TEST-007', 'Entrepôt fictif Strasbourg', '7 quai Inventé', '67000', 'Strasbourg', 22000.00, 'Surgelé', 48.58, 7.75, true, now()),
  ('10000000-0000-4000-8000-000000000008', 'TEST-008', 'Entrepôt fictif Rennes', '8 rue Simulée', '35000', 'Rennes', 17500.00, 'Logistique sèche', 48.11, -1.68, true, now()),
  ('10000000-0000-4000-8000-000000000009', 'TEST-009', 'Plateforme fictive Orléans', '9 boulevard Fictif', '45100', 'Orléans', 70000.00, 'Multi-température', 47.90, 1.90, true, now()),
  ('10000000-0000-4000-8000-000000000010', 'TEST-010', 'Entrepôt fictif Montpellier', '10 avenue Imaginaire', '34000', 'Montpellier', 26000.00, 'Frais', 43.61, 3.88, true, now()),
  ('10000000-0000-4000-8000-000000000011', 'TEST-011', 'Entrepôt fictif Dijon', '11 rue Inventée', '21000', 'Dijon', 15000.00, 'Logistique sèche', 47.32, 5.04, true, now()),
  ('10000000-0000-4000-8000-000000000012', 'TEST-012', 'Entrepôt fictif Rouen (fermé)', '12 chemin Simulé', '76000', 'Rouen', 12000.00, 'Logistique sèche', 49.44, 1.10, false, now())
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Visites. L'acteur des traces est positionné via request.jwt.claims.
-- ---------------------------------------------------------------------------

-- V1 : en cours, créée par Alice, Bruno participant (TEST-001).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.visits (id, site_id, type, reason, title, visit_date, subject, writer_id, status, created_by) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'technical', 'periodic',
   'Visite périodique Lyon Sud', current_date, 'Contrôle semestriel des quais et de la toiture.',
   '00000000-0000-4000-8000-000000000001', 'in_progress', '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.visit_participants (id, visit_id, profile_id, full_name, company, job_title, email, is_present, sort_order) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Alice Fictive', 'Carrefour Property (fictif)', 'Responsable technique', 'rt.alice@example.test', true, 0),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Bruno Fictif', 'Carrefour Property (fictif)', 'Responsable technique', 'rt.bruno@example.test', true, 1),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', null, 'Marc Imaginaire', 'Maintenance Fictive SAS', 'Chef de secteur', 'marc@example.test', true, 2)
on conflict (id) do nothing;

insert into public.visit_zone_notes (id, visit_id, zone_key, zone_label, sort_order, content, updated_by) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'roof', 'Toiture', 0, 'Étanchéité correcte. Deux lanterneaux à nettoyer (données fictives).', '00000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'docks', 'Quais', 1, 'Quai 14 : butoir gauche arraché. Quai 15 : butoir fissuré.', '00000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'sprinkler', 'Sprinklage', 2, 'Essai pompe conforme. Registre à jour.', '00000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'custom-parking', 'Parking PL', 3, 'Marquage au sol effacé côté sud.', '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- 5 réserves sur V1 (site TEST-001) : numérotées R-01 à R-05 par trigger.
-- R-01 ouverte, responsable interne Bruno, échéance à venir.
insert into public.reserves (id, visit_id, action, description, zone_key, priority, responsible_kind, responsible_profile_id, due_date, status, created_by) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'Remplacer les butoirs des quais 14 et 15', 'Butoirs arrachés et fissurés.', 'docks', 'high',
   'internal', '00000000-0000-4000-8000-000000000002', current_date + 30, 'open', '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
-- R-02 en cours, responsable interne Alice.
insert into public.reserves (id, visit_id, action, zone_key, priority, responsible_kind, responsible_profile_id, due_date, status, created_by) values
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
   'Nettoyer les lanterneaux de toiture', 'roof', 'normal',
   'internal', '00000000-0000-4000-8000-000000000001', current_date + 60, 'in_progress', '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
-- R-03 levée.
insert into public.reserves (id, visit_id, action, zone_key, priority, responsible_kind, responsible_profile_id, due_date, status, created_by) values
  ('50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001',
   'Mettre à jour le registre sprinklage', 'sprinkler', 'low',
   'internal', '00000000-0000-4000-8000-000000000002', current_date - 10, 'done', '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
-- R-04 ouverte et en retard (échéance passée).
insert into public.reserves (id, visit_id, action, zone_key, priority, responsible_kind, responsible_profile_id, due_date, status, created_by) values
  ('50000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001',
   'Refaire le marquage au sol du parking PL', 'custom-parking', 'urgent',
   'internal', '00000000-0000-4000-8000-000000000001', current_date - 15, 'open', '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
-- R-05 ouverte, responsable externe.
insert into public.reserves (id, visit_id, action, zone_key, priority, responsible_kind, responsible_name, responsible_company, responsible_email, due_date, status, created_by) values
  ('50000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001',
   'Resserrer la visserie du bardage façade nord', 'facades', 'normal',
   'external', 'Marc Imaginaire', 'Maintenance Fictive SAS', 'marc@example.test', current_date + 45, 'open', '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- V2 : terminée, créée par Bruno (TEST-002).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into public.visits (id, site_id, type, reason, title, visit_date, subject, writer_id, status, completed_at, completed_by, created_by) values
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'technical', 'post_claim',
   'Visite après sinistre Lille Nord', current_date - 20, 'Constat après dégât des eaux (fictif).',
   '00000000-0000-4000-8000-000000000002', 'completed', now() - interval '18 days',
   '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.visit_participants (id, visit_id, profile_id, full_name, company, job_title, is_present, sort_order) values
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Bruno Fictif', 'Carrefour Property (fictif)', 'Responsable technique', true, 0)
on conflict (id) do nothing;

insert into public.visit_zone_notes (id, visit_id, zone_key, zone_label, sort_order, content, updated_by) values
  ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 'roof', 'Toiture', 0, 'Infiltration localisée au-dessus de la cellule 3 (fictif).', '00000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000002', 'electrical', 'Électricité et TGBT', 1, 'RAS.', '00000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

-- V3 : supprimée (logiquement), créée par Alice (TEST-003).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.visits (id, site_id, type, reason, title, visit_date, status, created_by, deleted_at, deleted_by) values
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'meeting', 'meeting',
   'Réunion annulée Marseille', current_date - 5, 'in_progress',
   '00000000-0000-4000-8000-000000000001', now() - interval '2 days', '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Métadonnées de fichiers (lignes de tables uniquement : AUCUN objet n'est créé dans Storage,
-- les chemins ci-dessous ne correspondent à aucun fichier). Nécessaires aux tests de lecture.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into public.photos (id, visit_id, storage_path, thumb_path, original_filename, mime_type, width, height, size_bytes, caption, zone_key, sort_order, is_cover, upload_status, created_by) values
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001.jpg',
   '20000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001_thumb.jpg', 'quai-14.jpg',
   'image/jpeg', 1600, 1200, 350000, 'Quai 14, butoir arraché (photo fictive)', 'docks', 0, true, 'ready',
   '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.site_plans (id, site_id, name, storage_path, mime_type, page_count, uploaded_by, upload_status) values
  ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'Plan de masse (fictif)', '10000000-0000-4000-8000-000000000001/70000000-0000-4000-8000-000000000001/original.pdf',
   'application/pdf', 2, '00000000-0000-4000-8000-000000000001', 'ready')
on conflict (id) do nothing;

insert into public.site_plan_pages (id, plan_id, page_number, image_path, thumb_path, image_mime, width, height, size_bytes) values
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 1,
   '10000000-0000-4000-8000-000000000001/70000000-0000-4000-8000-000000000001/p1.png',
   '10000000-0000-4000-8000-000000000001/70000000-0000-4000-8000-000000000001/p1_thumb.jpg',
   'image/png', 3500, 2475, 120000),
  ('71000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001', 2,
   '10000000-0000-4000-8000-000000000001/70000000-0000-4000-8000-000000000001/p2.png',
   '10000000-0000-4000-8000-000000000001/70000000-0000-4000-8000-000000000001/p2_thumb.jpg',
   'image/png', 3500, 2475, 110000)
on conflict (id) do nothing;

insert into public.plan_markers (id, visit_id, plan_id, page, x, y, number, label, photo_id, created_by) values
  ('80000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '70000000-0000-4000-8000-000000000001', 1, 0.42000, 0.61000, 1, 'Quai 14',
   '60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.reserve_photos (reserve_id, photo_id, kind) values
  ('50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'defect')
on conflict do nothing;

-- Rapport généré sur la visite terminée V2 (fichier inexistant).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into public.reports (id, visit_id, storage_path, size_bytes, options, generated_by, generated_at) values
  ('90000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000002/90000000-0000-4000-8000-000000000001.pdf', 240000,
   '{"sections":["information","notes","reserves","photos"],"coverPhotoId":null,"photosPerPage":2,"quality":"standard"}',
   '00000000-0000-4000-8000-000000000002', now() - interval '17 days')
on conflict (id) do nothing;
-- Confirmé comme le ferait l'application (migration 17 : pending → ready).
update public.reports
set upload_status = 'ready', size_bytes = 240000, page_count = 6
where id = '90000000-0000-4000-8000-000000000001' and upload_status = 'pending';

-- Import VIGIE simulé par l'admin.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
insert into public.site_import_runs (id, file_name, mode, rows_total, rows_created, rows_updated, rows_deactivated, rows_rejected, errors, performed_by) values
  ('a0000000-0000-4000-8000-000000000001', 'vigie-export-fictif.csv', 'simulate', 12, 0, 12, 0, 0, '[]', '00000000-0000-4000-8000-000000000004')
on conflict (id) do nothing;

select set_config('request.jwt.claims', '', true);

commit;
