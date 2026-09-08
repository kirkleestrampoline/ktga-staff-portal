-- Version 1.6 — tenant-scoped usernames
-- Run manually in Supabase SQL Editor after the verified multi-tenant migration.
-- This migration does not alter Auth users, passwords, emails or profile ownership.
begin;

do $preflight$
declare duplicate_summary text;
begin
  if to_regclass('public.profiles') is null or to_regclass('public.clubs') is null then
    raise exception using errcode='P0001',message='Tenant username migration requires public.profiles and public.clubs';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='club_id' and data_type='uuid')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='username' and data_type='text') then
    raise exception using errcode='P0001',message='Tenant username migration requires profiles.club_id uuid and profiles.username text';
  end if;
  if exists(select 1 from public.profiles where club_id is null) then
    raise exception using errcode='P0001',message='Tenant username migration stopped: at least one profile has no club_id';
  end if;
  select string_agg(format('%s / %s (%s rows)',club_id,normalised_username,row_count),', ' order by club_id,normalised_username)
  into duplicate_summary
  from(
    select club_id,lower(btrim(username)) normalised_username,count(*) row_count
    from public.profiles
    where username is not null and btrim(username)<>''
    group by club_id,lower(btrim(username))
    having count(*)>1
  ) duplicates;
  if duplicate_summary is not null then
    raise exception using errcode='23505',message='Tenant username migration stopped: duplicate usernames already exist within a club: '||duplicate_summary;
  end if;
  if exists(
    select 1 from public.clubs
    where slug is null or btrim(slug)='' 
  ) then raise exception using errcode='P0001',message='Tenant username migration stopped: every club must have a club code'; end if;
  if exists(
    select 1 from public.clubs group by lower(btrim(slug)) having count(*)>1
  ) then raise exception using errcode='23505',message='Tenant username migration stopped: duplicate case-insensitive club codes exist'; end if;
end
$preflight$;

-- Enforce the desired rules before removing any legacy rule.
create unique index if not exists profiles_club_username_normalised_uidx
  on public.profiles(club_id,lower(btrim(username)))
  where username is not null and btrim(username)<>'';

create unique index if not exists clubs_slug_normalised_uidx
  on public.clubs(lower(btrim(slug)));

-- Remove legacy UNIQUE constraints whose only key is profiles.username.
do $drop_global_username_constraints$
declare item record;username_attnum smallint;
begin
  select attnum into username_attnum
  from pg_attribute
  where attrelid='public.profiles'::regclass and attname='username' and not attisdropped;

  for item in
    select c.conname
    from pg_constraint c
    where c.conrelid='public.profiles'::regclass
      and c.contype='u'
      and c.conkey=array[username_attnum]::smallint[]
  loop
    execute format('alter table public.profiles drop constraint %I',item.conname);
  end loop;
end
$drop_global_username_constraints$;

-- Remove standalone global unique username indexes, including lower(username)
-- variants, but never the new club-scoped index or a constraint-owned index.
do $drop_global_username_indexes$
declare item record;
begin
  for item in
    select i.indexrelid::regclass index_name
    from pg_index i
    where i.indrelid='public.profiles'::regclass
      and i.indisunique and not i.indisprimary
      and i.indexrelid<>to_regclass('public.profiles_club_username_normalised_uidx')
      and position('username' in lower(pg_get_indexdef(i.indexrelid)))>0
      and position('club_id' in lower(pg_get_indexdef(i.indexrelid)))=0
      and not exists(select 1 from pg_constraint c where c.conindid=i.indexrelid)
  loop
    execute format('drop index %s',item.index_name);
  end loop;
end
$drop_global_username_indexes$;

comment on index public.profiles_club_username_normalised_uidx is
  'Case-insensitive portal username uniqueness within one club tenant';
comment on index public.clubs_slug_normalised_uidx is
  'Case-insensitive uniqueness for login club codes';

notify pgrst,'reload schema';
commit;
