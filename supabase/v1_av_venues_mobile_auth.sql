-- AV GYMNASTICS SOLUTIONS v1.0 UPDATE
-- Adds venue assignment/tracking and supporting security.
-- Run ONCE after the existing v0.3 migration.

begin;

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  brand_color text,
  created_at timestamptz not null default now()
);

insert into public.venues(name,slug,active,brand_color) values
  ('Kirklees','kirklees',true,'#6D3A91'),
  ('Greenhead','greenhead',true,'#2F8F4E'),
  ('Other / Event','other-event',true,'#667085')
on conflict(slug) do update set name=excluded.name,active=true,brand_color=excluded.brand_color;

create table if not exists public.staff_venues (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(profile_id,venue_id)
);

alter table public.shifts add column if not exists venue_id uuid references public.venues(id) on delete set null;
create index if not exists shifts_venue_date_idx on public.shifts(venue_id,shift_date);
create index if not exists staff_venues_venue_idx on public.staff_venues(venue_id);

alter table public.venues enable row level security;
alter table public.staff_venues enable row level security;

drop policy if exists venues_read on public.venues;
create policy venues_read on public.venues for select to authenticated using(true);
drop policy if exists venues_admin_insert on public.venues;
create policy venues_admin_insert on public.venues for insert to authenticated with check(public.is_admin());
drop policy if exists venues_admin_update on public.venues;
create policy venues_admin_update on public.venues for update to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists venues_admin_delete on public.venues;
create policy venues_admin_delete on public.venues for delete to authenticated using(public.is_admin());

drop policy if exists staff_venues_read on public.staff_venues;
create policy staff_venues_read on public.staff_venues for select to authenticated
using(profile_id=auth.uid() or public.is_admin());
drop policy if exists staff_venues_insert on public.staff_venues;
create policy staff_venues_insert on public.staff_venues for insert to authenticated
with check(profile_id=auth.uid() or public.is_admin());
drop policy if exists staff_venues_delete on public.staff_venues;
create policy staff_venues_delete on public.staff_venues for delete to authenticated
using(profile_id=auth.uid() or public.is_admin());

grant select on public.venues to authenticated;
grant insert,update,delete on public.venues to authenticated;
grant select,insert,delete on public.staff_venues to authenticated;

-- Extend audit trail to venue membership changes without recording sensitive data.
create or replace function public.audit_staff_venue_change()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.audit_log(actor_id,subject_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),
    coalesce(new.profile_id,old.profile_id),
    lower(tg_op)||'_staff_venue',
    'staff_venues',
    coalesce(new.venue_id,old.venue_id),
    jsonb_build_object('venue_id',coalesce(new.venue_id,old.venue_id))
  );
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists audit_staff_venues on public.staff_venues;
create trigger audit_staff_venues after insert or delete on public.staff_venues
for each row execute function public.audit_staff_venue_change();

commit;
