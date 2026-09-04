-- Version 1.2 Sprint 1 — Employment & Pay Foundation
-- Employment is stored one-to-one on profiles. Existing hourly_rate remains intact.
begin;

do $preflight$
declare missing text[]:=array[]::text[];
begin
  if to_regclass('public.profiles') is null then missing:=array_append(missing,'table public.profiles'); end if;
  if to_regclass('public.scheduled_shifts') is null then missing:=array_append(missing,'table public.scheduled_shifts'); end if;
  if to_regclass('public.shifts') is null then missing:=array_append(missing,'table public.shifts'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='hourly_rate' and data_type='numeric') then missing:=array_append(missing,'profiles.hourly_rate numeric'); end if;
  if cardinality(missing)>0 then raise exception using errcode='P0001',message='Employment foundation preflight failed: '||array_to_string(missing,', '); end if;
end
$preflight$;

-- Add nullable first so existing rows can be backfilled without a table rewrite.
alter table public.profiles add column if not exists employment_type text;
alter table public.profiles add column if not exists standard_rate numeric(10,2);
alter table public.profiles add column if not exists enhanced_rate numeric(10,2);
alter table public.profiles add column if not exists can_volunteer boolean;
alter table public.profiles add column if not exists annual_salary numeric(12,2);
alter table public.profiles add column if not exists contracted_weekly_hours numeric(6,2);
alter table public.profiles add column if not exists working_weeks_per_year numeric(6,2);
alter table public.profiles add column if not exists invoice_required boolean;

do $compatibility$
begin
  if exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and ((column_name='employment_type' and data_type<>'text')
        or (column_name in ('standard_rate','enhanced_rate','annual_salary','contracted_weekly_hours','working_weeks_per_year') and data_type<>'numeric')
        or (column_name in ('can_volunteer','invoice_required') and data_type<>'boolean'))
  ) then raise exception using errcode='P0001',message='Employment foundation compatibility failed: an existing profile employment column has an incompatible type'; end if;
end
$compatibility$;

update public.profiles
set employment_type=coalesce(employment_type,'hourly'),
    standard_rate=coalesce(standard_rate,hourly_rate,0),
    enhanced_rate=coalesce(enhanced_rate,hourly_rate,0),
    can_volunteer=coalesce(can_volunteer,false),
    invoice_required=coalesce(invoice_required,false)
where employment_type is null or standard_rate is null or enhanced_rate is null or can_volunteer is null or invoice_required is null;

do $profile_constraints$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_employment_type_valid') then
    alter table public.profiles add constraint profiles_employment_type_valid check(employment_type in ('hourly','salaried','contractor','volunteer')) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_employment_values_valid') then
    alter table public.profiles add constraint profiles_employment_values_valid check(
      standard_rate>=0 and enhanced_rate>=0
      and (annual_salary is null or annual_salary>=0)
      and (contracted_weekly_hours is null or contracted_weekly_hours>0)
      and (working_weeks_per_year is null or working_weeks_per_year>0)
      and (employment_type<>'salaried' or (annual_salary is not null and contracted_weekly_hours is not null and working_weeks_per_year is not null))
    ) not valid;
  end if;
end
$profile_constraints$;
alter table public.profiles validate constraint profiles_employment_type_valid;
alter table public.profiles validate constraint profiles_employment_values_valid;

alter table public.profiles alter column employment_type set default 'hourly';
alter table public.profiles alter column employment_type set not null;
alter table public.profiles alter column standard_rate set default 0;
alter table public.profiles alter column standard_rate set not null;
alter table public.profiles alter column enhanced_rate set default 0;
alter table public.profiles alter column enhanced_rate set not null;
alter table public.profiles alter column can_volunteer set default false;
alter table public.profiles alter column can_volunteer set not null;
alter table public.profiles alter column invoice_required set default false;
alter table public.profiles alter column invoice_required set not null;

-- Payment type is prepared on planned assignments and resulting worked shifts.
alter table public.scheduled_shifts add column if not exists payment_type text default 'standard';
alter table public.shifts add column if not exists payment_type text default 'standard';
update public.scheduled_shifts set payment_type='standard' where payment_type is null;
update public.shifts set payment_type='standard' where payment_type is null;

do $payment_constraints$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.scheduled_shifts'::regclass and conname='scheduled_shifts_payment_type_valid') then
    alter table public.scheduled_shifts add constraint scheduled_shifts_payment_type_valid check(payment_type in ('standard','enhanced','volunteer')) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.shifts'::regclass and conname='shifts_payment_type_valid') then
    alter table public.shifts add constraint shifts_payment_type_valid check(payment_type in ('standard','enhanced','volunteer')) not valid;
  end if;
end
$payment_constraints$;
alter table public.scheduled_shifts validate constraint scheduled_shifts_payment_type_valid;
alter table public.shifts validate constraint shifts_payment_type_valid;
alter table public.scheduled_shifts alter column payment_type set default 'standard';
alter table public.scheduled_shifts alter column payment_type set not null;
alter table public.shifts alter column payment_type set default 'standard';
alter table public.shifts alter column payment_type set not null;

notify pgrst,'reload schema';
commit;
