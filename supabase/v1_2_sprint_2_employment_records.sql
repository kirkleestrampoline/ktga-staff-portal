-- Version 1.2 Sprint 2 — Dated Employment Records
-- Apply after v1_2_sprint_1_employment_pay_foundation.sql.
begin;

do $preflight$
declare missing text[]:=array[]::text[];
begin
  if to_regclass('public.profiles') is null then missing:=array_append(missing,'public.profiles'); end if;
  if to_regclass('public.venues') is null then missing:=array_append(missing,'public.venues'); end if;
  if to_regclass('public.staff_venues') is null then missing:=array_append(missing,'public.staff_venues'); end if;
  if to_regprocedure('public.can_manage_profile(uuid)') is null then missing:=array_append(missing,'public.can_manage_profile(uuid)'); end if;
  if cardinality(missing)>0 then raise exception using errcode='P0001',message='Employment records preflight failed: '||array_to_string(missing,', '); end if;
end
$preflight$;

create extension if not exists btree_gist with schema extensions;

create table if not exists public.employment_records(
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  organisation_id uuid not null,
  employment_type text not null,
  standard_rate numeric(10,2) not null default 0,
  enhanced_rate numeric(10,2) not null default 0,
  annual_salary numeric(12,2),
  contracted_weekly_hours numeric(6,2),
  working_weeks_per_year numeric(6,2),
  calculated_internal_hourly_rate numeric(10,2) generated always as (
    case when employment_type='salaried' then round(annual_salary/nullif(working_weeks_per_year,0)/nullif(contracted_weekly_hours,0),2) else null end
  ) stored,
  can_volunteer boolean not null default false,
  invoice_required boolean not null default false,
  effective_from date not null,
  effective_to date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $compatibility$
begin
  if exists(
    select 1 from (values
      ('id','uuid'),('profile_id','uuid'),('organisation_id','uuid'),('employment_type','text'),
      ('standard_rate','numeric'),('enhanced_rate','numeric'),('annual_salary','numeric'),
      ('contracted_weekly_hours','numeric'),('working_weeks_per_year','numeric'),
      ('calculated_internal_hourly_rate','numeric'),('can_volunteer','boolean'),('invoice_required','boolean'),
      ('effective_from','date'),('effective_to','date'),('active','boolean'),
      ('created_at','timestamp with time zone'),('updated_at','timestamp with time zone')
    ) expected(name,type)
    where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='employment_records' and c.column_name=expected.name and c.data_type=expected.type)
  ) then raise exception using errcode='P0001',message='Employment records compatibility failed: existing public.employment_records has an incompatible shape'; end if;
end
$compatibility$;

do $constraints$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.employment_records'::regclass and conname='employment_records_profile_fk') then
    alter table public.employment_records add constraint employment_records_profile_fk foreign key(profile_id) references public.profiles(id) on delete restrict not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.employment_records'::regclass and conname='employment_records_organisation_fk') then
    alter table public.employment_records add constraint employment_records_organisation_fk foreign key(organisation_id) references public.venues(id) on delete restrict not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.employment_records'::regclass and conname='employment_records_values_valid') then
    alter table public.employment_records add constraint employment_records_values_valid check(
      employment_type in ('hourly','salaried','contractor','volunteer')
      and standard_rate>=0 and enhanced_rate>=0
      and (annual_salary is null or annual_salary>=0)
      and (contracted_weekly_hours is null or contracted_weekly_hours>0)
      and (working_weeks_per_year is null or working_weeks_per_year>0)
      and (effective_to is null or effective_to>=effective_from)
      and (employment_type<>'salaried' or (annual_salary is not null and contracted_weekly_hours is not null and working_weeks_per_year is not null))
    ) not valid;
  end if;
end
$constraints$;
alter table public.employment_records validate constraint employment_records_profile_fk;
alter table public.employment_records validate constraint employment_records_organisation_fk;
alter table public.employment_records validate constraint employment_records_values_valid;

do $overlap_constraint$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.employment_records'::regclass and conname='employment_records_no_overlap') then
    alter table public.employment_records add constraint employment_records_no_overlap exclude using gist(
      profile_id with =,
      organisation_id with =,
      daterange(effective_from,coalesce(effective_to,'infinity'::date),'[]') with &&
    );
  end if;
end
$overlap_constraint$;

insert into public.employment_records(
  profile_id,organisation_id,employment_type,standard_rate,enhanced_rate,annual_salary,
  contracted_weekly_hours,working_weeks_per_year,can_volunteer,invoice_required,effective_from,effective_to,active
)
select distinct p.id,sv.venue_id,p.employment_type,p.standard_rate,p.enhanced_rate,p.annual_salary,
  p.contracted_weekly_hours,p.working_weeks_per_year,p.can_volunteer,p.invoice_required,current_date,null,true
from public.profiles p
join public.staff_venues sv on sv.profile_id=p.id
where not exists(
  select 1 from public.employment_records er
  where er.profile_id=p.id and er.organisation_id=sv.venue_id
);

create index if not exists employment_records_profile_dates_idx on public.employment_records(profile_id,effective_from desc);
create index if not exists employment_records_organisation_dates_idx on public.employment_records(organisation_id,effective_from,effective_to);

alter table public.employment_records enable row level security;
do $policies$
begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='employment_records' and policyname='employment_records_read') then
    create policy employment_records_read on public.employment_records for select to authenticated using(profile_id=auth.uid() or public.can_manage_profile(profile_id));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='employment_records' and policyname='employment_records_manage') then
    create policy employment_records_manage on public.employment_records for all to authenticated using(public.can_manage_profile(profile_id)) with check(public.can_manage_profile(profile_id));
  end if;
end
$policies$;
grant select,insert,update on public.employment_records to authenticated;

create or replace function public.create_employment_record_version(p_existing_id uuid,p_record jsonb)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $function$
declare existing public.employment_records%rowtype;new_id uuid;
begin
  if p_existing_id is not null then
    select * into existing from public.employment_records where id=p_existing_id for update;
    if not found then raise exception using errcode='P0001',message='Employment record was not found or cannot be managed'; end if;
    if existing.effective_from>=current_date then raise exception using errcode='P0001',message='A record beginning today cannot be versioned again today'; end if;
    update public.employment_records set effective_to=current_date-1,active=false,updated_at=now() where id=p_existing_id;
  end if;

  insert into public.employment_records(profile_id,organisation_id,employment_type,standard_rate,enhanced_rate,annual_salary,contracted_weekly_hours,working_weeks_per_year,can_volunteer,invoice_required,effective_from,effective_to,active)
  values(
    (p_record->>'profile_id')::uuid,(p_record->>'organisation_id')::uuid,p_record->>'employment_type',
    coalesce((p_record->>'standard_rate')::numeric,0),coalesce((p_record->>'enhanced_rate')::numeric,0),
    nullif(p_record->>'annual_salary','')::numeric,nullif(p_record->>'contracted_weekly_hours','')::numeric,nullif(p_record->>'working_weeks_per_year','')::numeric,
    coalesce((p_record->>'can_volunteer')::boolean,false),coalesce((p_record->>'invoice_required')::boolean,false),
    coalesce(nullif(p_record->>'effective_from','')::date,current_date),null,true
  ) returning id into new_id;
  return new_id;
end
$function$;
revoke all on function public.create_employment_record_version(uuid,jsonb) from public;
grant execute on function public.create_employment_record_version(uuid,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
