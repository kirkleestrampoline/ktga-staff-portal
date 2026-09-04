-- Version 1.2 — Final Kirklees Polish: shared Class Profile settings
-- Apply after v1_2_sprint_2_1_club_architecture_polish.sql. Do not execute automatically.
begin;

do $preflight$
begin
  if to_regclass('public.classes') is null then
    raise exception using errcode='P0001',message='Final Kirklees polish preflight failed: public.classes is missing';
  end if;
end
$preflight$;

alter table public.classes add column if not exists session_colour text;
alter table public.classes add column if not exists capacity integer;
alter table public.classes add column if not exists programme text;
alter table public.classes add column if not exists minimum_age integer;
alter table public.classes add column if not exists maximum_age integer;
alter table public.classes add column if not exists warn_if_understaffed boolean;
alter table public.classes add column if not exists critical_if_no_lead boolean;
alter table public.classes add column if not exists allow_below_recommended_qualification boolean;

do $compatibility$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='classes' and (
    (column_name='session_colour' and data_type<>'text') or
    (column_name='capacity' and data_type<>'integer') or
    (column_name='programme' and data_type<>'text') or
    (column_name in ('minimum_age','maximum_age') and data_type<>'integer') or
    (column_name in ('warn_if_understaffed','critical_if_no_lead','allow_below_recommended_qualification') and data_type<>'boolean')
  )) then
    raise exception using errcode='P0001',message='Final Kirklees polish compatibility failed: an existing Class Profile column has an incompatible type';
  end if;
end
$compatibility$;

update public.classes set
  session_colour=coalesce(session_colour,'#6D3A91'),
  warn_if_understaffed=coalesce(warn_if_understaffed,true),
  critical_if_no_lead=coalesce(critical_if_no_lead,true),
  allow_below_recommended_qualification=coalesce(allow_below_recommended_qualification,true)
where session_colour is null or warn_if_understaffed is null or critical_if_no_lead is null or allow_below_recommended_qualification is null;

do $constraints$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.classes'::regclass and conname='classes_profile_values_valid') then
    alter table public.classes add constraint classes_profile_values_valid check(
      session_colour ~ '^#[0-9A-Fa-f]{6}$'
      and (capacity is null or capacity>0)
      and (minimum_age is null or minimum_age>=0)
      and (maximum_age is null or maximum_age>=0)
      and (minimum_age is null or maximum_age is null or maximum_age>=minimum_age)
    ) not valid;
  end if;
end
$constraints$;
alter table public.classes validate constraint classes_profile_values_valid;

alter table public.classes alter column session_colour set default '#6D3A91';
alter table public.classes alter column session_colour set not null;
alter table public.classes alter column warn_if_understaffed set default true;
alter table public.classes alter column warn_if_understaffed set not null;
alter table public.classes alter column critical_if_no_lead set default true;
alter table public.classes alter column critical_if_no_lead set not null;
alter table public.classes alter column allow_below_recommended_qualification set default true;
alter table public.classes alter column allow_below_recommended_qualification set not null;

-- A Class Profile is the single source of truth for shared configuration.
-- public.classes remains the recurring-session table used by the established
-- schedule-generation functions.
create table if not exists public.class_profiles(
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null default public.current_club_id(),
  name text not null,
  programme text,
  session_colour text not null default '#6D3A91',
  capacity integer not null,
  session_length_minutes integer not null,
  minimum_age integer,
  maximum_age integer,
  active boolean not null default true,
  lead_coaches_required integer not null default 1,
  assistant_coaches_required integer not null default 0,
  minimum_coaches integer not null default 1,
  maximum_coaches integer not null default 1,
  lead_recommended_qualification_id uuid,
  assistant_recommended_qualification_id uuid,
  warn_if_understaffed boolean not null default true,
  critical_if_no_lead boolean not null default true,
  allow_below_recommended_qualification boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.classes add column if not exists class_profile_id uuid;

do $profile_compatibility$
begin
  if exists(
    select 1 from (values
      ('id','uuid'),('club_id','uuid'),('name','text'),('programme','text'),
      ('session_colour','text'),('capacity','integer'),('session_length_minutes','integer'),
      ('minimum_age','integer'),('maximum_age','integer'),('active','boolean'),
      ('lead_coaches_required','integer'),('assistant_coaches_required','integer'),
      ('minimum_coaches','integer'),('maximum_coaches','integer'),
      ('lead_recommended_qualification_id','uuid'),('assistant_recommended_qualification_id','uuid'),
      ('warn_if_understaffed','boolean'),('critical_if_no_lead','boolean'),
      ('allow_below_recommended_qualification','boolean'),
      ('created_at','timestamp with time zone'),('updated_at','timestamp with time zone')
    ) expected(name,type)
    where not exists(
      select 1 from information_schema.columns actual
      where actual.table_schema='public' and actual.table_name='class_profiles'
        and actual.column_name=expected.name and actual.data_type=expected.type
    )
  ) then
    raise exception using errcode='P0001',message='Final Kirklees polish compatibility failed: public.class_profiles has an incompatible shape';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='classes' and column_name='class_profile_id' and data_type='uuid') then
    raise exception using errcode='P0001',message='Final Kirklees polish compatibility failed: public.classes.class_profile_id must be uuid';
  end if;
end
$profile_compatibility$;

do $profile_constraints$
begin
  if exists(select 1 from pg_constraint where conrelid='public.classes'::regclass and conname='classes_class_profile_fk') and not exists(
    select 1
    from pg_constraint constraint_record
    join pg_attribute source_column on source_column.attrelid=constraint_record.conrelid and source_column.attnum=constraint_record.conkey[1]
    join pg_attribute target_column on target_column.attrelid=constraint_record.confrelid and target_column.attnum=constraint_record.confkey[1]
    where constraint_record.conrelid='public.classes'::regclass
      and constraint_record.conname='classes_class_profile_fk'
      and constraint_record.contype='f'
      and constraint_record.confrelid='public.class_profiles'::regclass
      and cardinality(constraint_record.conkey)=1 and cardinality(constraint_record.confkey)=1
      and source_column.attname='class_profile_id' and target_column.attname='id'
  ) then
    raise exception using errcode='P0001',message='Final Kirklees polish compatibility failed: classes_class_profile_fk does not link classes.class_profile_id to class_profiles.id';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.class_profiles'::regclass and conname='class_profiles_club_fk') then
    alter table public.class_profiles add constraint class_profiles_club_fk foreign key(club_id) references public.clubs(id) on delete restrict not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.class_profiles'::regclass and conname='class_profiles_lead_qualification_fk') then
    alter table public.class_profiles add constraint class_profiles_lead_qualification_fk foreign key(lead_recommended_qualification_id) references public.qualification_types(id) on delete set null not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.class_profiles'::regclass and conname='class_profiles_assistant_qualification_fk') then
    alter table public.class_profiles add constraint class_profiles_assistant_qualification_fk foreign key(assistant_recommended_qualification_id) references public.qualification_types(id) on delete set null not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.class_profiles'::regclass and conname='class_profiles_values_valid') then
    alter table public.class_profiles add constraint class_profiles_values_valid check(
      btrim(name)<>'' and session_colour ~ '^#[0-9A-Fa-f]{6}$'
      and capacity>0 and session_length_minutes between 1 and 1440
      and (minimum_age is null or minimum_age>=0)
      and (maximum_age is null or maximum_age>=0)
      and (minimum_age is null or maximum_age is null or maximum_age>=minimum_age)
      and lead_coaches_required>=0 and assistant_coaches_required>=0
      and minimum_coaches>=0 and maximum_coaches>=minimum_coaches
    ) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.classes'::regclass and conname='classes_class_profile_fk') then
    alter table public.classes add constraint classes_class_profile_fk foreign key(class_profile_id) references public.class_profiles(id) on delete restrict not valid;
  end if;
end
$profile_constraints$;

-- Preserve existing rows by creating one profile for each legacy class group.
-- The application previously defined a group as exact class name + venue.
-- Keep the map, insert and link operation in one statement. On a rerun there are
-- no NULL class_profile_id rows, so every CTE is empty and this is a safe no-op.
with missing_groups as materialized (
  select gen_random_uuid() id,c.club_id,c.venue_id,lower(btrim(c.name)) legacy_key
  from public.classes c
  where c.class_profile_id is null
  group by c.club_id,c.venue_id,lower(btrim(c.name))
), representative_profiles as materialized (
  select distinct on(map.id)
    map.id,c.club_id,c.name,c.programme,c.session_colour,coalesce(c.capacity,1) capacity,
    greatest(1,round(extract(epoch from(case when c.finish_time<c.start_time then c.finish_time-c.start_time+interval '1 day' else c.finish_time-c.start_time end))/60)::integer) session_length_minutes,
    c.minimum_age,c.maximum_age,c.active,c.lead_coaches_required,c.assistant_coaches_required,
    c.minimum_coaches,c.maximum_coaches,c.lead_recommended_qualification_id,
    c.assistant_recommended_qualification_id,c.warn_if_understaffed,c.critical_if_no_lead,
    c.allow_below_recommended_qualification
  from missing_groups map
  join public.classes c on c.club_id=map.club_id and c.venue_id=map.venue_id and lower(btrim(c.name))=map.legacy_key
  order by map.id,c.active desc,c.updated_at desc nulls last,c.id
), inserted_profiles as (
  insert into public.class_profiles(
    id,club_id,name,programme,session_colour,capacity,session_length_minutes,
    minimum_age,maximum_age,active,lead_coaches_required,assistant_coaches_required,
    minimum_coaches,maximum_coaches,lead_recommended_qualification_id,
    assistant_recommended_qualification_id,warn_if_understaffed,critical_if_no_lead,
    allow_below_recommended_qualification
  )
  select
    id,club_id,name,programme,session_colour,capacity,session_length_minutes,
    minimum_age,maximum_age,active,lead_coaches_required,assistant_coaches_required,
    minimum_coaches,maximum_coaches,lead_recommended_qualification_id,
    assistant_recommended_qualification_id,warn_if_understaffed,critical_if_no_lead,
    allow_below_recommended_qualification
  from representative_profiles
  returning id
)
update public.classes session
set class_profile_id=map.id
from missing_groups map
join inserted_profiles inserted on inserted.id=map.id
where session.class_profile_id is null and session.club_id=map.club_id
  and session.venue_id=map.venue_id and lower(btrim(session.name))=map.legacy_key;

alter table public.class_profiles validate constraint class_profiles_club_fk;
alter table public.class_profiles validate constraint class_profiles_lead_qualification_fk;
alter table public.class_profiles validate constraint class_profiles_assistant_qualification_fk;
alter table public.class_profiles validate constraint class_profiles_values_valid;
alter table public.classes validate constraint classes_class_profile_fk;
alter table public.classes alter column class_profile_id set not null;

do $duplicate_sessions$
begin
  if exists(
    select 1 from public.classes where active=true
    group by class_profile_id,weekday,start_time having count(*)>1
  ) then
    raise exception using errcode='23505',message='Duplicate active recurring sessions exist for a Class Profile at the same day and start time';
  end if;
end
$duplicate_sessions$;

create unique index if not exists classes_profile_recurring_session_unique
  on public.classes(class_profile_id,weekday,start_time) where active=true;
create index if not exists classes_class_profile_idx on public.classes(class_profile_id);
create index if not exists class_profiles_club_active_idx on public.class_profiles(club_id,active,name);

-- Existing schedule SQL reads shared columns from public.classes. These triggers
-- maintain those columns as compatibility projections; class_profiles remains the
-- only table written by the Class Profile editor for shared configuration.
create or replace function public.apply_class_profile_to_session()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $function$
declare profile public.class_profiles%rowtype;
begin
  select * into profile from public.class_profiles where id=new.class_profile_id;
  if not found then raise exception using errcode='23503',message='Class Profile does not exist'; end if;
  new.club_id:=profile.club_id;
  new.name:=profile.name;
  new.programme:=profile.programme;
  new.session_colour:=profile.session_colour;
  new.capacity:=profile.capacity;
  new.minimum_age:=profile.minimum_age;
  new.maximum_age:=profile.maximum_age;
  new.active:=profile.active;
  new.coaches_required:=greatest(1,profile.lead_coaches_required+profile.assistant_coaches_required);
  new.lead_coaches_required:=profile.lead_coaches_required;
  new.assistant_coaches_required:=profile.assistant_coaches_required;
  new.minimum_coaches:=profile.minimum_coaches;
  new.maximum_coaches:=profile.maximum_coaches;
  new.lead_recommended_qualification_id:=profile.lead_recommended_qualification_id;
  new.assistant_recommended_qualification_id:=profile.assistant_recommended_qualification_id;
  new.warn_if_understaffed:=profile.warn_if_understaffed;
  new.critical_if_no_lead:=profile.critical_if_no_lead;
  new.allow_below_recommended_qualification:=profile.allow_below_recommended_qualification;
  new.finish_time:=(new.start_time+make_interval(mins=>profile.session_length_minutes))::time;
  return new;
end
$function$;

create or replace function public.propagate_class_profile_to_sessions()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $function$
begin
  update public.classes set
    name=new.name,programme=new.programme,session_colour=new.session_colour,
    capacity=new.capacity,minimum_age=new.minimum_age,maximum_age=new.maximum_age,
    coaches_required=greatest(1,new.lead_coaches_required+new.assistant_coaches_required),
    lead_coaches_required=new.lead_coaches_required,
    assistant_coaches_required=new.assistant_coaches_required,
    minimum_coaches=new.minimum_coaches,maximum_coaches=new.maximum_coaches,
    lead_recommended_qualification_id=new.lead_recommended_qualification_id,
    assistant_recommended_qualification_id=new.assistant_recommended_qualification_id,
    warn_if_understaffed=new.warn_if_understaffed,
    critical_if_no_lead=new.critical_if_no_lead,
    allow_below_recommended_qualification=new.allow_below_recommended_qualification,
    finish_time=(start_time+make_interval(mins=>new.session_length_minutes))::time,
    updated_at=now()
  where class_profile_id=new.id;
  return new;
end
$function$;

drop trigger if exists apply_class_profile_to_session on public.classes;
create trigger apply_class_profile_to_session before insert or update of class_profile_id,start_time
on public.classes for each row execute function public.apply_class_profile_to_session();
drop trigger if exists propagate_class_profile_to_sessions on public.class_profiles;
create trigger propagate_class_profile_to_sessions after update on public.class_profiles
for each row execute function public.propagate_class_profile_to_sessions();
revoke all on function public.apply_class_profile_to_session() from public;
revoke all on function public.propagate_class_profile_to_sessions() from public;

create or replace function public.set_class_profile_active(p_profile_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public as $function$
declare profile_club uuid;
begin
  select club_id into profile_club from public.class_profiles where id=p_profile_id;
  if profile_club is null or profile_club<>public.current_club_id() or not exists(
    select 1 from public.profiles where id=auth.uid() and club_id=profile_club
      and is_active=true and role in ('org_admin','admin','club_owner')
  ) then raise exception using errcode='42501',message='Not authorised to manage this Class Profile'; end if;
  update public.class_profiles set active=p_active,updated_at=now() where id=p_profile_id;
  update public.classes set active=p_active,updated_at=now() where class_profile_id=p_profile_id;
end
$function$;

create or replace function public.delete_class_profile_if_unused(p_profile_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $function$
declare profile_club uuid;reference_table text;has_history boolean;
begin
  select club_id into profile_club from public.class_profiles where id=p_profile_id for update;
  if profile_club is null then raise exception using errcode='P0002',message='Class Profile not found'; end if;
  if profile_club<>public.current_club_id() or not exists(
    select 1 from public.profiles where id=auth.uid() and club_id=profile_club
      and is_active=true and role in ('org_admin','admin','club_owner')
  ) then raise exception using errcode='42501',message='Not authorised to delete this Class Profile'; end if;

  -- Detect current and future operational tables that reference a recurring class.
  for reference_table in
    select distinct columns.table_name from information_schema.columns columns
    where columns.table_schema='public' and columns.column_name='class_id'
      and columns.table_name not in ('classes','class_staffing_slots')
  loop
    execute format('select exists(select 1 from public.%I history where history.class_id in (select id from public.classes where class_profile_id=$1))',reference_table)
      into has_history using p_profile_id;
    if has_history then raise exception using errcode='P0001',message='This class contains historical records and cannot be deleted. Archive it instead.'; end if;
  end loop;

  -- The scheduled shift check above protects confirmed work, payroll derived from
  -- confirmed work, assignment history and any attendance linked to those shifts.
  delete from public.class_staffing_slots where class_id in(select id from public.classes where class_profile_id=p_profile_id);
  delete from public.classes where class_profile_id=p_profile_id;
  delete from public.class_profiles where id=p_profile_id;
end
$function$;

revoke all on function public.set_class_profile_active(uuid,boolean) from public;
revoke all on function public.delete_class_profile_if_unused(uuid) from public;
grant execute on function public.set_class_profile_active(uuid,boolean) to authenticated;
grant execute on function public.delete_class_profile_if_unused(uuid) to authenticated;

alter table public.class_profiles enable row level security;
do $profile_policies$
begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='class_profiles' and policyname='class_profiles_member_read') then
    create policy class_profiles_member_read on public.class_profiles for select to authenticated using(club_id=public.current_club_id());
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='class_profiles' and policyname='class_profiles_owner_manage') then
    create policy class_profiles_owner_manage on public.class_profiles for all to authenticated
      using(club_id=public.current_club_id() and exists(select 1 from public.profiles where id=auth.uid() and club_id=public.current_club_id() and is_active=true and role in ('org_admin','admin','club_owner')))
      with check(club_id=public.current_club_id() and exists(select 1 from public.profiles where id=auth.uid() and club_id=public.current_club_id() and is_active=true and role in ('org_admin','admin','club_owner')));
  end if;
end
$profile_policies$;
grant select,insert,update,delete on public.class_profiles to authenticated;

notify pgrst,'reload schema';
commit;
