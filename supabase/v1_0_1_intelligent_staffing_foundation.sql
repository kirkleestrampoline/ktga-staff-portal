-- v1.0.1 — Intelligent Class Staffing Foundation (production-safe)
-- Run as database owner after a verified backup and during a controlled deployment.
-- Existing schedule generation continues to use classes.coaches_required.
--
-- ROLLBACK PLAN (documentation only; intentionally not automated/destructive):
-- If validation fails after deployment, disable the new assignment trigger first and
-- capability-gate the application. Retain and export coaching_assignment_history.
-- Only with explicit approval should the view, trigger/function, policies, new FKs,
-- columns and tables be removed in dependency order. Never delete history without a
-- separately verified archive.

begin;

-- 1. Fail before making changes if required production dependencies are incompatible.
do $preflight$
declare missing text[]:=array[]::text[];
begin
  if to_regclass('public.profiles') is null then missing:=array_append(missing,'table public.profiles'); end if;
  if to_regclass('public.classes') is null then missing:=array_append(missing,'table public.classes'); end if;
  if to_regclass('public.scheduled_shifts') is null then missing:=array_append(missing,'table public.scheduled_shifts'); end if;
  if to_regclass('public.class_staffing_slots') is null then missing:=array_append(missing,'table public.class_staffing_slots'); end if;
  if to_regclass('public.venues') is null then missing:=array_append(missing,'table public.venues'); end if;

  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='id' and data_type='uuid') then missing:=array_append(missing,'profiles.id uuid'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='full_name' and data_type='text') then missing:=array_append(missing,'profiles.full_name text'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='hourly_rate' and data_type='numeric') then missing:=array_append(missing,'profiles.hourly_rate numeric'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='classes' and column_name='id' and data_type='uuid') then missing:=array_append(missing,'classes.id uuid'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='classes' and column_name='coaches_required' and data_type='integer') then missing:=array_append(missing,'classes.coaches_required integer'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='scheduled_shifts' and column_name='id' and data_type='uuid') then missing:=array_append(missing,'scheduled_shifts.id uuid'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='scheduled_shifts' and column_name='profile_id' and data_type='uuid') then missing:=array_append(missing,'scheduled_shifts.profile_id uuid'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='scheduled_shifts' and column_name='class_id' and data_type='uuid') then missing:=array_append(missing,'scheduled_shifts.class_id uuid'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='scheduled_shifts' and column_name='staffing_slot_id' and data_type='uuid') then missing:=array_append(missing,'scheduled_shifts.staffing_slot_id uuid'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='scheduled_shifts' and column_name='venue_id' and data_type='uuid') then missing:=array_append(missing,'scheduled_shifts.venue_id uuid'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='scheduled_shifts' and column_name='shift_date' and data_type='date') then missing:=array_append(missing,'scheduled_shifts.shift_date date'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='scheduled_shifts' and column_name='start_time' and data_type='time without time zone') then missing:=array_append(missing,'scheduled_shifts.start_time time'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='scheduled_shifts' and column_name='finish_time' and data_type='time without time zone') then missing:=array_append(missing,'scheduled_shifts.finish_time time'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='scheduled_shifts' and column_name='class_name' and data_type='text') then missing:=array_append(missing,'scheduled_shifts.class_name text'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='class_staffing_slots' and column_name='id' and data_type='uuid') then missing:=array_append(missing,'class_staffing_slots.id uuid'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='class_staffing_slots' and column_name='slot_number' and data_type='integer') then missing:=array_append(missing,'class_staffing_slots.slot_number integer'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='venues' and column_name='id' and data_type='uuid') then missing:=array_append(missing,'venues.id uuid'); end if;
  if to_regprocedure('public.is_global_admin()') is null then missing:=array_append(missing,'function is_global_admin()'); end if;
  if to_regprocedure('public.can_manage_profile(uuid)') is null then missing:=array_append(missing,'function can_manage_profile(uuid)'); end if;

  if cardinality(missing)>0 then raise exception using errcode='P0001',message='Intelligent Staffing preflight failed: '||array_to_string(missing,', '); end if;
end
$preflight$;

-- IF NOT EXISTS must never silently accept an incompatible partial deployment.
do $target_compatibility$
declare problem text;
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='coaching_types' and data_type<>'ARRAY') then problem:='profiles.coaching_types'; end if;
  if problem is null and exists(
    select 1 from information_schema.columns where table_schema='public' and table_name='classes'
    and column_name in('lead_coaches_required','assistant_coaches_required','minimum_coaches','maximum_coaches') and data_type<>'integer'
  ) then problem:='classes staffing count columns'; end if;
  if problem is null and exists(
    select 1 from information_schema.columns where table_schema='public' and table_name='classes'
    and column_name in('lead_recommended_qualification_id','assistant_recommended_qualification_id') and data_type<>'uuid'
  ) then problem:='classes recommended qualification columns'; end if;
  if problem is null and to_regclass('public.qualification_types') is not null and exists(
    select 1 from (values ('id','uuid'),('name','text'),('description','text'),('active','boolean'),('created_at','timestamp with time zone'),('updated_at','timestamp with time zone')) e(n,t)
    where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='qualification_types' and c.column_name=e.n and c.data_type=e.t)
  ) then problem:='qualification_types'; end if;
  if problem is null and to_regclass('public.coach_qualifications') is not null and exists(
    select 1 from (values ('id','uuid'),('coach_id','uuid'),('qualification_id','uuid'),('awarded_date','date'),('expiry_date','date'),('notes','text'),('created_at','timestamp with time zone'),('updated_at','timestamp with time zone')) e(n,t)
    where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='coach_qualifications' and c.column_name=e.n and c.data_type=e.t)
  ) then problem:='coach_qualifications'; end if;
  if problem is null and to_regclass('public.coaching_assignment_history') is not null and exists(
    select 1 from (values ('event_key','text'),('scheduled_shift_id','uuid'),('coach_id','uuid'),('coach_name','text'),('class_id','uuid'),('staffing_slot_id','uuid'),('staffing_role','text'),('shift_date','date'),('organisation_id','uuid'),('venue_id','uuid'),('class_name','text'),('start_time','time without time zone'),('finish_time','time without time zone'),('break_minutes','integer'),('duration_hours','numeric'),('hourly_rate','numeric'),('estimated_staffing_cost','numeric'),('assigned_at','timestamp with time zone')) e(n,t)
    where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='coaching_assignment_history' and c.column_name=e.n and c.data_type=e.t)
  ) then problem:='coaching_assignment_history'; end if;
  if problem is null and to_regclass('public.staffing_recommendation_settings') is not null and exists(
    select 1 from (values ('id','integer'),('priorities','jsonb'),('updated_at','timestamp with time zone'),('updated_by','uuid')) e(n,t)
    where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='staffing_recommendation_settings' and c.column_name=e.n and c.data_type=e.t)
  ) then problem:='staffing_recommendation_settings'; end if;
  if problem is not null then raise exception using errcode='P0001',message='Intelligent Staffing compatibility check failed for existing public.'||problem; end if;
end
$target_compatibility$;

-- 2. Qualification catalogue and multiple qualifications per coach.
create table if not exists public.qualification_types(
 id uuid primary key default gen_random_uuid(),name text not null,description text,
 active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.coach_qualifications(
 id uuid primary key default gen_random_uuid(),coach_id uuid not null,qualification_id uuid not null,
 awarded_date date,expiry_date date,notes text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

do $qualification_constraints$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.coach_qualifications'::regclass and conname='coach_qualifications_coach_fk') then alter table public.coach_qualifications add constraint coach_qualifications_coach_fk foreign key(coach_id) references public.profiles(id) on delete cascade not valid; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.coach_qualifications'::regclass and conname='coach_qualifications_qualification_fk') then alter table public.coach_qualifications add constraint coach_qualifications_qualification_fk foreign key(qualification_id) references public.qualification_types(id) on delete cascade not valid; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.coach_qualifications'::regclass and conname='coach_qualifications_coach_qualification_key') then alter table public.coach_qualifications add constraint coach_qualifications_coach_qualification_key unique(coach_id,qualification_id); end if;
end
$qualification_constraints$;
alter table public.coach_qualifications validate constraint coach_qualifications_coach_fk;
alter table public.coach_qualifications validate constraint coach_qualifications_qualification_fk;

do $qualification_duplicates$
begin
 if exists(select 1 from public.qualification_types group by lower(btrim(name)) having count(*)>1) then raise exception using errcode='23505',message='Duplicate case-insensitive qualification names must be reconciled before migration'; end if;
end
$qualification_duplicates$;
-- New/small tables use atomic standard indexes. If pre-existing tables are large,
-- create these CONCURRENTLY in a separate deployment before running this transaction.
create unique index if not exists qualification_types_name_unique on public.qualification_types(lower(btrim(name)));
create index if not exists coach_qualifications_coach_idx on public.coach_qualifications(coach_id);
create index if not exists coach_qualifications_qualification_idx on public.coach_qualifications(qualification_id);

-- 3. Profile capabilities: default, backfill, NOT VALID, explicit validation.
alter table public.profiles add column if not exists coaching_types text[] default '{}'::text[];
update public.profiles set coaching_types='{}'::text[] where coaching_types is null;
do $profile_constraints$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_coaching_types_not_null') then alter table public.profiles add constraint profiles_coaching_types_not_null check(coaching_types is not null) not valid; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_coaching_types_valid') then alter table public.profiles add constraint profiles_coaching_types_valid check(coaching_types <@ array['lead_coach','assistant_coach','preschool','recreational','performance','dmt','gymnastics','disability','other']::text[]) not valid; end if;
end
$profile_constraints$;
alter table public.profiles validate constraint profiles_coaching_types_not_null;
alter table public.profiles validate constraint profiles_coaching_types_valid;
alter table public.profiles alter column coaching_types set default '{}'::text[];
alter table public.profiles alter column coaching_types set not null;

-- 4. Class metadata: nullable first, backfill, validate, then defaults/NOT NULL.
alter table public.classes add column if not exists lead_coaches_required integer;
alter table public.classes add column if not exists assistant_coaches_required integer;
alter table public.classes add column if not exists minimum_coaches integer;
alter table public.classes add column if not exists maximum_coaches integer;
alter table public.classes add column if not exists lead_recommended_qualification_id uuid;
alter table public.classes add column if not exists assistant_recommended_qualification_id uuid;
update public.classes set
 lead_coaches_required=coalesce(lead_coaches_required,greatest(1,coalesce(coaches_required,1))),
 assistant_coaches_required=coalesce(assistant_coaches_required,0),
 minimum_coaches=coalesce(minimum_coaches,greatest(1,coalesce(coaches_required,1))),
 maximum_coaches=coalesce(maximum_coaches,greatest(1,coalesce(coaches_required,1)))
where lead_coaches_required is null or assistant_coaches_required is null or minimum_coaches is null or maximum_coaches is null;
do $class_constraints$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.classes'::regclass and conname='classes_staffing_counts_not_null') then alter table public.classes add constraint classes_staffing_counts_not_null check(lead_coaches_required is not null and assistant_coaches_required is not null and minimum_coaches is not null and maximum_coaches is not null) not valid; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.classes'::regclass and conname='classes_staffing_metadata_valid') then alter table public.classes add constraint classes_staffing_metadata_valid check(lead_coaches_required>=0 and assistant_coaches_required>=0 and minimum_coaches>=0 and maximum_coaches>=minimum_coaches) not valid; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.classes'::regclass and conname='classes_lead_recommended_qualification_fk') then alter table public.classes add constraint classes_lead_recommended_qualification_fk foreign key(lead_recommended_qualification_id) references public.qualification_types(id) on delete set null not valid; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.classes'::regclass and conname='classes_assistant_recommended_qualification_fk') then alter table public.classes add constraint classes_assistant_recommended_qualification_fk foreign key(assistant_recommended_qualification_id) references public.qualification_types(id) on delete set null not valid; end if;
end
$class_constraints$;
alter table public.classes validate constraint classes_staffing_counts_not_null;
alter table public.classes validate constraint classes_staffing_metadata_valid;
alter table public.classes validate constraint classes_lead_recommended_qualification_fk;
alter table public.classes validate constraint classes_assistant_recommended_qualification_fk;
alter table public.classes alter column lead_coaches_required set default 1;
alter table public.classes alter column assistant_coaches_required set default 0;
alter table public.classes alter column minimum_coaches set default 1;
alter table public.classes alter column maximum_coaches set default 1;
alter table public.classes alter column lead_coaches_required set not null;
alter table public.classes alter column assistant_coaches_required set not null;
alter table public.classes alter column minimum_coaches set not null;
alter table public.classes alter column maximum_coaches set not null;

-- 5. Immutable history. coach_id is nullable/SET NULL and coach_name is snapshotted.
create table if not exists public.coaching_assignment_history(
 id bigint generated always as identity primary key,event_key text not null,
 scheduled_shift_id uuid,coach_id uuid,coach_name text not null,class_id uuid,staffing_slot_id uuid,
 staffing_role text not null default 'lead',assignment_reason text default 'manual',shift_date date not null,organisation_id uuid,venue_id uuid,
 class_name text not null,start_time time not null,finish_time time not null,break_minutes integer not null default 0,
 duration_hours numeric(8,2) not null,hourly_rate numeric(10,2) not null default 0,
 estimated_staffing_cost numeric(10,2) not null default 0,assigned_at timestamptz not null default now()
);
alter table public.coaching_assignment_history add column if not exists assignment_reason text default 'manual';
do $history_constraints$
declare delete_action "char";
begin
 select confdeltype into delete_action from pg_constraint where conrelid='public.coaching_assignment_history'::regclass and conname='coaching_assignment_history_coach_fk';
 if delete_action is not null and delete_action<>'n' then raise exception using errcode='P0001',message='Existing history coach FK does not use ON DELETE SET NULL'; end if;
 if delete_action is null then alter table public.coaching_assignment_history add constraint coaching_assignment_history_coach_fk foreign key(coach_id) references public.profiles(id) on delete set null not valid; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.coaching_assignment_history'::regclass and conname='coaching_assignment_history_shift_fk') then alter table public.coaching_assignment_history add constraint coaching_assignment_history_shift_fk foreign key(scheduled_shift_id) references public.scheduled_shifts(id) on delete set null not valid; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.coaching_assignment_history'::regclass and conname='coaching_assignment_history_class_fk') then alter table public.coaching_assignment_history add constraint coaching_assignment_history_class_fk foreign key(class_id) references public.classes(id) on delete set null not valid; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.coaching_assignment_history'::regclass and conname='coaching_assignment_history_slot_fk') then alter table public.coaching_assignment_history add constraint coaching_assignment_history_slot_fk foreign key(staffing_slot_id) references public.class_staffing_slots(id) on delete set null not valid; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.coaching_assignment_history'::regclass and conname='coaching_assignment_history_organisation_fk') then alter table public.coaching_assignment_history add constraint coaching_assignment_history_organisation_fk foreign key(organisation_id) references public.venues(id) on delete set null not valid; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.coaching_assignment_history'::regclass and conname='coaching_assignment_history_venue_fk') then alter table public.coaching_assignment_history add constraint coaching_assignment_history_venue_fk foreign key(venue_id) references public.venues(id) on delete set null not valid; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.coaching_assignment_history'::regclass and conname='coaching_assignment_history_role_valid') then alter table public.coaching_assignment_history add constraint coaching_assignment_history_role_valid check(staffing_role in('lead','assistant')) not valid; end if;
end
$history_constraints$;
alter table public.coaching_assignment_history validate constraint coaching_assignment_history_coach_fk;
alter table public.coaching_assignment_history validate constraint coaching_assignment_history_shift_fk;
alter table public.coaching_assignment_history validate constraint coaching_assignment_history_class_fk;
alter table public.coaching_assignment_history validate constraint coaching_assignment_history_slot_fk;
alter table public.coaching_assignment_history validate constraint coaching_assignment_history_organisation_fk;
alter table public.coaching_assignment_history validate constraint coaching_assignment_history_venue_fk;
alter table public.coaching_assignment_history validate constraint coaching_assignment_history_role_valid;

-- Backfill before enabling the trigger. Deterministic event_key makes reruns safe;
-- future A→B→A assignments receive distinct event keys and remain valid history.
insert into public.coaching_assignment_history(event_key,scheduled_shift_id,coach_id,coach_name,class_id,staffing_slot_id,staffing_role,shift_date,organisation_id,venue_id,class_name,start_time,finish_time,break_minutes,duration_hours,hourly_rate,estimated_staffing_cost,assigned_at)
select 'baseline:'||s.id::text||':'||s.profile_id::text,s.id,s.profile_id,p.full_name,s.class_id,s.staffing_slot_id,
 case when coalesce(slot.slot_number,1)>coalesce(c.lead_coaches_required,1) then 'assistant' else 'lead' end,
 s.shift_date,s.venue_id,s.venue_id,s.class_name,s.start_time,s.finish_time,coalesce(s.break_minutes,0),
 greatest(0,round((extract(epoch from(case when s.finish_time<s.start_time then s.finish_time-s.start_time+interval '1 day' else s.finish_time-s.start_time end))/3600-coalesce(s.break_minutes,0)/60.0)::numeric,2)),coalesce(p.hourly_rate,0),
 round(greatest(0,(extract(epoch from(case when s.finish_time<s.start_time then s.finish_time-s.start_time+interval '1 day' else s.finish_time-s.start_time end))/3600-coalesce(s.break_minutes,0)/60.0))*coalesce(p.hourly_rate,0),2),now()
from public.scheduled_shifts s join public.profiles p on p.id=s.profile_id
left join public.classes c on c.id=s.class_id left join public.class_staffing_slots slot on slot.id=s.staffing_slot_id
where s.profile_id is not null and not exists(select 1 from public.coaching_assignment_history h where h.event_key='baseline:'||s.id::text||':'||s.profile_id::text);

create unique index if not exists coaching_history_event_key_unique on public.coaching_assignment_history(event_key);
create index if not exists coaching_history_coach_date_idx on public.coaching_assignment_history(coach_id,shift_date desc);
create index if not exists coaching_history_class_date_idx on public.coaching_assignment_history(class_id,shift_date desc);
create index if not exists coaching_history_organisation_idx on public.coaching_assignment_history(organisation_id,shift_date desc);

-- 6. Trigger function and trigger, installed only after backfill.
create or replace function public.record_coaching_assignment()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare v_lead integer:=1;v_slot integer:=1;v_role text:='lead';v_duration numeric(8,2);v_rate numeric(10,2):=0;v_name text:='Former staff member';
begin
 if new.profile_id is null then return new; end if;
 if tg_op='UPDATE' and new.profile_id is not distinct from old.profile_id then return new; end if;
 if new.class_id is not null then select coalesce(lead_coaches_required,1) into v_lead from public.classes where id=new.class_id; end if;
 if new.staffing_slot_id is not null then select coalesce(slot_number,1) into v_slot from public.class_staffing_slots where id=new.staffing_slot_id; end if;
 if coalesce(v_slot,1)>coalesce(v_lead,1) then v_role:='assistant'; end if;
 v_duration:=greatest(0,round((extract(epoch from(case when new.finish_time<new.start_time then new.finish_time-new.start_time+interval '1 day' else new.finish_time-new.start_time end))/3600-coalesce(new.break_minutes,0)/60.0)::numeric,2));
 select coalesce(hourly_rate,0),coalesce(full_name,'Former staff member') into v_rate,v_name from public.profiles where id=new.profile_id;
 insert into public.coaching_assignment_history(event_key,scheduled_shift_id,coach_id,coach_name,class_id,staffing_slot_id,staffing_role,shift_date,organisation_id,venue_id,class_name,start_time,finish_time,break_minutes,duration_hours,hourly_rate,estimated_staffing_cost)
 values(gen_random_uuid()::text,new.id,new.profile_id,v_name,new.class_id,new.staffing_slot_id,v_role,new.shift_date,new.venue_id,new.venue_id,new.class_name,new.start_time,new.finish_time,coalesce(new.break_minutes,0),v_duration,v_rate,round(v_duration*v_rate,2));
 return new;
end
$function$;
revoke all on function public.record_coaching_assignment() from public;
do $trigger$
begin
 if not exists(select 1 from pg_trigger where tgrelid='public.scheduled_shifts'::regclass and tgname='record_scheduled_shift_assignment' and not tgisinternal) then create trigger record_scheduled_shift_assignment after insert or update of profile_id on public.scheduled_shifts for each row execute function public.record_coaching_assignment(); end if;
end
$trigger$;

-- 7. Extensible JSON settings and security-invoker aggregate view.
create table if not exists public.staffing_recommendation_settings(
 id integer primary key default 1 check(id=1),
 priorities jsonb not null default '{"availability":35,"previous_coach":20,"lower_staffing_cost":10,"recommended_qualification":15,"organisation_match":10,"weekly_hours":10}'::jsonb,
 updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id) on delete set null
);
insert into public.staffing_recommendation_settings(id) values(1) on conflict(id) do nothing;
create or replace view public.class_coaching_statistics with(security_invoker=true) as
select class_id,coach_id,max(coach_name) coach_name,max(class_name) class_name,count(*)::bigint sessions_coached,max(shift_date) last_coached_date,round(avg(estimated_staffing_cost),2) average_staffing_cost
from public.coaching_assignment_history where class_id is not null group by class_id,coach_id;

-- 8. RLS. Existing named policies and unrelated policies/triggers are untouched.
alter table public.qualification_types enable row level security;
alter table public.coach_qualifications enable row level security;
alter table public.coaching_assignment_history enable row level security;
alter table public.staffing_recommendation_settings enable row level security;
do $policies$
begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='qualification_types' and policyname='qualification_types_read') then create policy qualification_types_read on public.qualification_types for select to authenticated using(true); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='qualification_types' and policyname='qualification_types_manage') then create policy qualification_types_manage on public.qualification_types for all to authenticated using(public.is_global_admin()) with check(public.is_global_admin()); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='coach_qualifications' and policyname='coach_qualifications_read') then create policy coach_qualifications_read on public.coach_qualifications for select to authenticated using(coach_id=auth.uid() or public.can_manage_profile(coach_id)); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='coach_qualifications' and policyname='coach_qualifications_manage') then create policy coach_qualifications_manage on public.coach_qualifications for all to authenticated using(public.can_manage_profile(coach_id)) with check(public.can_manage_profile(coach_id)); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='coaching_assignment_history' and policyname='coaching_history_read') then create policy coaching_history_read on public.coaching_assignment_history for select to authenticated using(coach_id=auth.uid() or (coach_id is not null and public.can_manage_profile(coach_id)) or public.is_global_admin()); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='staffing_recommendation_settings' and policyname='staffing_settings_read') then create policy staffing_settings_read on public.staffing_recommendation_settings for select to authenticated using(true); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='staffing_recommendation_settings' and policyname='staffing_settings_manage') then create policy staffing_settings_manage on public.staffing_recommendation_settings for all to authenticated using(public.is_global_admin()) with check(public.is_global_admin()); end if;
end
$policies$;
grant select on public.qualification_types,public.coaching_assignment_history,public.staffing_recommendation_settings to authenticated;
grant select,insert,update,delete on public.coach_qualifications to authenticated;
grant insert,update,delete on public.qualification_types,public.staffing_recommendation_settings to authenticated;
grant select on public.class_coaching_statistics to authenticated;

-- Standard PostgREST schema-cache refresh after a successful transactional migration.
notify pgrst,'reload schema';
commit;
