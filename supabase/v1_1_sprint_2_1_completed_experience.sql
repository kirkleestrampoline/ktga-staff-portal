-- Version 1.1 Sprint 2.1 — Confirmed-work coaching experience
-- Apply after v1_0_1_intelligent_staffing_foundation.sql.
-- This does not alter or remove assignment-event history.
begin;

do $preflight$
declare missing text[]:=array[]::text[];
begin
  if to_regclass('public.scheduled_shifts') is null then
    missing:=array_append(missing,'table public.scheduled_shifts');
  end if;
  if to_regclass('public.profiles') is null then
    missing:=array_append(missing,'table public.profiles');
  end if;

  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='scheduled_shifts' and column_name='id' and data_type='uuid') then missing:=array_append(missing,'scheduled_shifts.id uuid'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='scheduled_shifts' and column_name='class_id' and data_type='uuid') then missing:=array_append(missing,'scheduled_shifts.class_id uuid'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='scheduled_shifts' and column_name='profile_id' and data_type='uuid') then missing:=array_append(missing,'scheduled_shifts.profile_id uuid'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='scheduled_shifts' and column_name='venue_id' and data_type='uuid') then missing:=array_append(missing,'scheduled_shifts.venue_id uuid'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='scheduled_shifts' and column_name='class_name' and data_type='text') then missing:=array_append(missing,'scheduled_shifts.class_name text'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='scheduled_shifts' and column_name='shift_date' and data_type='date') then missing:=array_append(missing,'scheduled_shifts.shift_date date'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='scheduled_shifts' and column_name='status') then missing:=array_append(missing,'scheduled_shifts.status'); end if;

  if cardinality(missing)>0 then
    raise exception using errcode='P0001',message='Completed experience preflight failed: '||array_to_string(missing,', ');
  end if;
end
$preflight$;

-- The view reflects the final authoritative state. Confirming contributes one
-- completed session; unconfirming/cancelling removes it; reassignment before
-- confirmation credits only the final profile_id. Counts span every month.
create or replace view public.completed_class_coaching_statistics
with (security_invoker=true) as
select
  class_id,
  profile_id as coach_id,
  venue_id as organisation_id,
  lower(btrim(class_name)) as programme_key,
  max(class_name) as class_name,
  count(*)::bigint as sessions_coached,
  max(shift_date) as last_coached_date
from public.scheduled_shifts scheduled
join public.profiles coach on coach.id=scheduled.profile_id
where scheduled.status='confirmed'
  and scheduled.class_id is not null
  and scheduled.profile_id is not null
  and lower(btrim(coach.full_name)) not in ('unassigned','unfilled','vacant')
group by scheduled.class_id,scheduled.profile_id,scheduled.venue_id,lower(btrim(scheduled.class_name));

grant select on public.completed_class_coaching_statistics to authenticated;

notify pgrst,'reload schema';
commit;
