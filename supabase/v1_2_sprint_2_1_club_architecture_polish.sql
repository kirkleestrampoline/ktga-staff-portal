-- Version 1.2 Sprint 2.1 — Club Architecture Polish
-- Apply after v1_2_sprint_2_club_architecture.sql. Do not execute automatically.
begin;

do $preflight$
declare missing text[]:=array[]::text[];
begin
  if to_regclass('public.clubs') is null then missing:=array_append(missing,'public.clubs'); end if;
  if to_regclass('public.venues') is null then missing:=array_append(missing,'public.venues'); end if;
  if to_regclass('public.staff_venues') is null then missing:=array_append(missing,'public.staff_venues'); end if;
  if to_regclass('public.profiles') is null then missing:=array_append(missing,'public.profiles'); end if;
  if not exists(select 1 from public.clubs where lower(btrim(name))='kirklees trampoline gymnastics academy') then missing:=array_append(missing,'Kirklees club'); end if;
  if cardinality(missing)>0 then raise exception using errcode='P0001',message='Club polish preflight failed: '||array_to_string(missing,', '); end if;
end
$preflight$;

-- Abort rather than remove a legacy venue if unexpected operational data exists.
do $legacy_safety$
declare legacy_ids uuid[];problem text;
begin
  select coalesce(array_agg(id),array[]::uuid[]) into legacy_ids from public.venues where lower(btrim(slug)) in ('greenhead','other','other-event');
  if cardinality(legacy_ids)=0 then return; end if;
  if exists(select 1 from public.classes where venue_id=any(legacy_ids)) then problem:='classes'; end if;
  if problem is null and exists(select 1 from public.scheduled_shifts where venue_id=any(legacy_ids)) then problem:='scheduled_shifts'; end if;
  if problem is null and exists(select 1 from public.shifts where venue_id=any(legacy_ids)) then problem:='shifts'; end if;
  if problem is null and to_regclass('public.shift_templates') is not null and exists(select 1 from public.shift_templates where venue_id=any(legacy_ids)) then problem:='shift_templates'; end if;
  if problem is null and exists(select 1 from public.invoices where venue_id=any(legacy_ids)) then problem:='invoices'; end if;
  if problem is null and to_regclass('public.coaching_assignment_history') is not null and exists(select 1 from public.coaching_assignment_history where venue_id=any(legacy_ids) or organisation_id=any(legacy_ids)) then problem:='coaching_assignment_history'; end if;
  if problem is not null then raise exception using errcode='P0001',message='Club polish stopped: a legacy venue is referenced by public.'||problem; end if;
end
$legacy_safety$;

-- Contractor is now represented by Hourly without altering rates or pay history.
update public.profiles set employment_type='hourly' where employment_type='contractor';
alter table public.profiles drop constraint if exists profiles_employment_type_valid;
alter table public.profiles add constraint profiles_employment_type_valid check(employment_type in ('hourly','salaried','volunteer')) not valid;
alter table public.profiles validate constraint profiles_employment_type_valid;

do $employment_records$
begin
  if to_regclass('public.employment_records') is not null then
    update public.employment_records set employment_type='hourly',updated_at=now() where employment_type='contractor';
    alter table public.employment_records drop constraint if exists employment_records_values_valid;
    alter table public.employment_records add constraint employment_records_values_valid check(
      employment_type in ('hourly','salaried','volunteer')
      and standard_rate>=0 and enhanced_rate>=0
      and (annual_salary is null or annual_salary>=0)
      and (contracted_weekly_hours is null or contracted_weekly_hours>0)
      and (working_weeks_per_year is null or working_weeks_per_year>0)
      and (effective_to is null or effective_to>=effective_from)
      and (employment_type<>'salaried' or (annual_salary is not null and contracted_weekly_hours is not null and working_weeks_per_year is not null))
    ) not valid;
    alter table public.employment_records validate constraint employment_records_values_valid;
  end if;
end
$employment_records$;

-- Remove only obsolete relationships, followed by the empty demo venues.
do $employment_cleanup$
begin
  if to_regclass('public.employment_records') is not null then
    delete from public.employment_records where organisation_id in(select id from public.venues where lower(btrim(slug)) in ('greenhead','other','other-event'));
  end if;
end
$employment_cleanup$;
delete from public.staff_venues where venue_id in(select id from public.venues where lower(btrim(slug)) in ('greenhead','other','other-event'));
delete from public.venues where lower(btrim(slug)) in ('greenhead','other','other-event');

notify pgrst,'reload schema';
commit;
