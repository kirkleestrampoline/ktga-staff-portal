-- Version 1.5 — Platform Admin and Multi-Tenant Hardening
-- Apply after v1.4 migrations. Safe to rerun. Do not create test clubs here.
begin;

do $preflight$ begin
  if to_regclass('public.clubs') is null or to_regclass('public.profiles') is null or to_regclass('public.venues') is null then
    raise exception using errcode='P0001',message='Platform Admin preflight failed: clubs, profiles or venues is missing';
  end if;
  if not exists(select 1 from public.clubs where id='f55b2e78-e461-4ad7-bd98-c969b77f1cf7' and name='Kirklees Trampoline Gymnastics Academy') then
    raise exception using errcode='P0001',message='Platform Admin preflight failed: protected Kirklees tenant does not match its live identity';
  end if;
end $preflight$;

alter table public.clubs add column if not exists slug text;
update public.clubs set slug='kirklees' where id='f55b2e78-e461-4ad7-bd98-c969b77f1cf7' and slug is null;
update public.clubs set slug=trim(both '-' from regexp_replace(lower(name),'[^a-z0-9]+','-','g'))||'-'||left(id::text,8) where slug is null;
alter table public.clubs alter column slug set not null;
create unique index if not exists clubs_slug_unique on public.clubs(lower(btrim(slug)));

alter table public.business_settings drop constraint if exists business_settings_id_check;
create sequence if not exists public.business_settings_id_seq owned by public.business_settings.id;
select setval('public.business_settings_id_seq',greatest(coalesce((select max(id) from public.business_settings),1),1));
alter table public.business_settings alter column id set default nextval('public.business_settings_id_seq');
alter table public.business_settings add column if not exists club_id uuid;
update public.business_settings set club_id='f55b2e78-e461-4ad7-bd98-c969b77f1cf7' where club_id is null;
alter table public.business_settings alter column club_id set not null;
do $business_fk$ begin if not exists(select 1 from pg_constraint where conrelid='public.business_settings'::regclass and conname='business_settings_club_fk') then alter table public.business_settings add constraint business_settings_club_fk foreign key(club_id) references public.clubs(id) on delete restrict not valid;end if;end $business_fk$;
alter table public.business_settings validate constraint business_settings_club_fk;
create unique index if not exists business_settings_club_unique on public.business_settings(club_id);

create table if not exists public.platform_activity(
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete restrict,
  club_id uuid references public.clubs(id) on delete restrict, action text not null, entity_type text not null,
  entity_id uuid, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  constraint platform_activity_action_valid check(action in ('club_created','first_owner_created','club_updated','club_suspended','club_reactivated'))
);
create index if not exists platform_activity_club_date_idx on public.platform_activity(club_id,created_at desc);

create or replace function public.is_platform_admin() returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and is_active=true);
$$;
create or replace function public.is_global_admin() returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select public.is_platform_admin(); $$;
create or replace function public.current_club_id() returns uuid language sql stable security definer set search_path=pg_catalog,public as $$
 select p.club_id from public.profiles p join public.clubs c on c.id=p.club_id where p.id=auth.uid() and p.is_active=true and (c.active=true or p.role='admin');
$$;
create or replace function public.is_club_admin(p_club uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select public.is_platform_admin() or exists(select 1 from public.profiles p join public.clubs c on c.id=p.club_id where p.id=auth.uid() and p.club_id=p_club and p.role in ('club_owner','org_admin') and p.is_active=true and c.active=true);
$$;
create or replace function public.is_venue_admin(p_venue uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select public.is_platform_admin() or exists(select 1 from public.venues v where v.id=p_venue and public.is_club_admin(v.club_id)) or exists(select 1 from public.staff_venues sv join public.profiles p on p.id=sv.profile_id join public.venues v on v.id=sv.venue_id where sv.profile_id=auth.uid() and sv.venue_id=p_venue and sv.is_admin=true and p.role='org_admin' and p.is_active=true and v.club_id=p.club_id);
$$;
create or replace function public.can_manage_profile(p_profile uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select public.is_platform_admin() or exists(select 1 from public.profiles me join public.profiles target on target.id=p_profile where me.id=auth.uid() and me.club_id=target.club_id and me.role='club_owner' and me.is_active=true) or exists(select 1 from public.staff_venues mine join public.staff_venues theirs on theirs.venue_id=mine.venue_id join public.profiles me on me.id=mine.profile_id join public.profiles target on target.id=theirs.profile_id where mine.profile_id=auth.uid() and mine.is_admin=true and target.id=p_profile and me.club_id=target.club_id and me.role='org_admin' and me.is_active=true);
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select public.is_club_admin(public.current_club_id()); $$;

create or replace function public.profiles_tenant_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    if new.club_id is distinct from old.club_id then raise exception using errcode='42501',message='Club assignment is managed by the server';end if;
    if new.role is distinct from old.role and (
      new.role in ('admin','club_owner') or auth.uid()=old.id or not exists(
        select 1 from public.profiles actor where actor.id=auth.uid() and actor.club_id=old.club_id and actor.role='club_owner' and actor.is_active=true
      )
    ) then raise exception using errcode='42501',message='Protected roles are managed by an authorised administrator';end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_tenant_guard on public.profiles;
create trigger profiles_tenant_guard before update on public.profiles for each row execute function public.profiles_tenant_guard();
revoke all on function public.is_platform_admin() from public;grant execute on function public.is_platform_admin() to authenticated;
revoke all on function public.is_club_admin(uuid) from public;grant execute on function public.is_club_admin(uuid) to authenticated;

alter table public.platform_activity enable row level security;
drop policy if exists platform_activity_admin on public.platform_activity;
create policy platform_activity_admin on public.platform_activity for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
grant select,insert on public.platform_activity to authenticated;

drop policy if exists business_select on public.business_settings;
create policy business_select on public.business_settings for select to authenticated using(club_id=public.current_club_id() or public.is_platform_admin());
drop policy if exists business_update on public.business_settings;
create policy business_update on public.business_settings for update to authenticated using(public.is_club_admin(club_id)) with check(public.is_club_admin(club_id));

drop policy if exists clubs_member_read on public.clubs;
create policy clubs_member_read on public.clubs for select to authenticated using(id=public.current_club_id() or public.is_platform_admin());
drop policy if exists clubs_owner_update on public.clubs;
create policy clubs_owner_update on public.clubs for update to authenticated using(id=public.current_club_id() and public.is_club_admin(id)) with check(id=public.current_club_id() and public.is_club_admin(id));

drop policy if exists venues_read on public.venues;
create policy venues_read on public.venues for select to authenticated using(club_id=public.current_club_id() or public.is_platform_admin());
drop policy if exists qualification_types_read on public.qualification_types;
create policy qualification_types_read on public.qualification_types for select to authenticated using(club_id=public.current_club_id() or public.is_platform_admin());
drop policy if exists qualification_types_manage on public.qualification_types;
create policy qualification_types_manage on public.qualification_types for all to authenticated using(public.is_club_admin(club_id)) with check(public.is_club_admin(club_id));

-- Direct club-owned tables are already club-aware; these indexes support policy and admin queries.
create index if not exists venues_club_idx on public.venues(club_id);
create index if not exists expenses_club_profile_idx on public.expenses(club_id,profile_id);

notify pgrst,'reload schema';
commit;
