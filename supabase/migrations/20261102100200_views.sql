-- Étape 2 · migration 3 : valeurs dérivées calculées à la lecture.
-- Les vues sont en security_invoker : la RLS des tables sous-jacentes s'applique à l'appelant.

-- Date du jour à Paris, à un instant donné (par défaut maintenant). Pure, testable autour de minuit.
create or replace function private.paris_date(at timestamptz default now())
returns date
language sql
immutable
set search_path = ''
as $$
  select (at at time zone 'Europe/Paris')::date
$$;
comment on function private.paris_date(timestamptz) is 'Date civile en Europe/Paris de l''instant donné.';

-- Une réserve est en retard si son échéance est dépassée (à Paris) et qu'elle n'est pas levée.
create or replace function private.is_reserve_overdue(
  due_date date,
  status public.reserve_status,
  at timestamptz default now()
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select due_date is not null
    and status <> 'done'
    and due_date < private.paris_date(at)
$$;
comment on function private.is_reserve_overdue(date, public.reserve_status, timestamptz) is
  'Retard d''une réserve : échéance strictement passée en Europe/Paris et statut différent de done.';

-- Code affiché d'une réserve : R-07.
create or replace function private.reserve_code(number integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'R-' || lpad(number::text, 2, '0')
$$;

grant execute on function private.paris_date(timestamptz) to anon, authenticated, service_role;
grant execute on function private.is_reserve_overdue(date, public.reserve_status, timestamptz)
  to anon, authenticated, service_role;
grant execute on function private.reserve_code(integer) to anon, authenticated, service_role;

create or replace view public.reserves_with_state
with (security_invoker = true)
as
select
  r.*,
  private.is_reserve_overdue(r.due_date, r.status, now()) as is_overdue,
  private.reserve_code(r.number) as code
from public.reserves r;
comment on view public.reserves_with_state is 'Réserves avec is_overdue (calculé en Europe/Paris) et le code affiché R-07. RLS de reserves appliquée.';

create or replace view public.visit_summaries
with (security_invoker = true)
as
select
  v.id,
  v.site_id,
  s.warehouse_code as site_code,
  s.name as site_name,
  s.city as site_city,
  v.type,
  v.reason,
  v.title,
  v.visit_date,
  v.subject,
  v.status,
  v.writer_id,
  v.created_by,
  v.completed_at,
  v.version,
  v.created_at,
  v.updated_at,
  coalesce(rs.open_count, 0)::integer as open_reserves_count,
  coalesce(rs.overdue_count, 0)::integer as overdue_reserves_count,
  coalesce(rs.done_count, 0)::integer as done_reserves_count,
  coalesce(ph.photo_count, 0)::integer as photos_count,
  rp.last_report_at
from public.visits v
join public.sites s on s.id = v.site_id
left join lateral (
  select
    count(*) filter (where r.status <> 'done') as open_count,
    count(*) filter (where private.is_reserve_overdue(r.due_date, r.status, now())) as overdue_count,
    count(*) filter (where r.status = 'done') as done_count
  from public.reserves r
  where r.visit_id = v.id and r.deleted_at is null
) rs on true
left join lateral (
  select count(*) as photo_count from public.photos p where p.visit_id = v.id
) ph on true
left join lateral (
  select max(rep.generated_at) as last_report_at from public.reports rep where rep.visit_id = v.id
) rp on true
where v.deleted_at is null;
comment on view public.visit_summaries is 'Visite + site + compteurs de réserves (ouvertes, en retard, levées), photos et dernier rapport. Visites supprimées exclues.';

grant select on public.reserves_with_state, public.visit_summaries to anon, authenticated, service_role;
