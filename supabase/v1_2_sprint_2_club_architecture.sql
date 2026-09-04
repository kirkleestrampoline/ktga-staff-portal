-- Version 1.2 Sprint 2 — Club Architecture Foundation
-- Apply after the current v1.2 foundation migrations. Do not execute automatically.
-- Legacy venues remain in place while operational ownership moves to clubs.
begin;

do $preflight$
declare missing text[]:=array[]::text[];
begin
  if to_regclass('public.profiles') is null then missing:=array_append(missing,'public.profiles'); end if;
  if to_regclass('public.venues') is null then missing:=array_append(missing,'public.venues'); end if;
  if to_regclass('public.staff_venues') is null then missing:=array_append(missing,'public.staff_venues'); end if;
  if to_regclass('public.classes') is null then missing:=array_append(missing,'public.classes'); end if;
  if to_regclass('public.scheduled_shifts') is null then missing:=array_append(missing,'public.scheduled_shifts'); end if;
  if to_regclass('public.shifts') is null then missing:=array_append(missing,'public.shifts'); end if;
  if to_regclass('public.timesheets') is null then missing:=array_append(missing,'public.timesheets'); end if;
  if to_regclass('public.invoices') is null then missing:=array_append(missing,'public.invoices'); end if;
  if to_regclass('public.qualification_types') is null then missing:=array_append(missing,'public.qualification_types'); end if;
  if not exists(select 1 from public.venues where lower(btrim(slug))='kirklees') then missing:=array_append(missing,'Kirklees legacy venue'); end if;
  if cardinality(missing)>0 then raise exception using errcode='P0001',message='Club architecture preflight failed: '||array_to_string(missing,', '); end if;
end
$preflight$;

create table if not exists public.clubs(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  logo_url text,
  primary_colour text not null default '#6D3A91',
  secondary_colour text not null default '#243044',
  email text,
  telephone text,
  website text,
  address text,
  bank_details text,
  payroll_month integer not null default 1,
  timezone text not null default 'Europe/London',
  currency text not null default 'GBP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  active boolean not null default true
);

do $compatibility$
begin
  if exists(
    select 1 from (values
      ('id','uuid'),('name','text'),('short_name','text'),('logo_url','text'),
      ('primary_colour','text'),('secondary_colour','text'),('email','text'),('telephone','text'),
      ('website','text'),('address','text'),('bank_details','text'),('payroll_month','integer'),
      ('timezone','text'),('currency','text'),('created_at','timestamp with time zone'),
      ('updated_at','timestamp with time zone'),('active','boolean')
    ) expected(name,type)
    where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='clubs' and c.column_name=expected.name and c.data_type=expected.type)
  ) then raise exception using errcode='P0001',message='Club architecture compatibility failed: existing public.clubs has an incompatible shape'; end if;
end
$compatibility$;

do $club_constraints$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.clubs'::regclass and conname='clubs_settings_valid') then
    alter table public.clubs add constraint clubs_settings_valid check(
      btrim(name)<>'' and primary_colour ~ '^#[0-9A-Fa-f]{6}$'
      and secondary_colour ~ '^#[0-9A-Fa-f]{6}$' and payroll_month between 1 and 12
      and btrim(timezone)<>'' and btrim(currency)<>''
    ) not valid;
  end if;
end
$club_constraints$;
alter table public.clubs validate constraint clubs_settings_valid;
create unique index if not exists clubs_name_unique on public.clubs(lower(btrim(name)));

insert into public.clubs(name,short_name,primary_colour,secondary_colour,timezone,currency)
values('Kirklees Trampoline Gymnastics Academy','Kirklees','#6D3A91','#243044','Europe/London','GBP')
on conflict do nothing;

alter table public.venues add column if not exists club_id uuid;
alter table public.venues add column if not exists legacy boolean not null default false;
alter table public.profiles add column if not exists club_id uuid;
alter table public.classes add column if not exists club_id uuid;
alter table public.scheduled_shifts add column if not exists club_id uuid;
alter table public.shifts add column if not exists club_id uuid;
alter table public.timesheets add column if not exists club_id uuid;
alter table public.invoices add column if not exists club_id uuid;
alter table public.qualification_types add column if not exists club_id uuid;

do $ownership_compatibility$
declare item text;
begin
  foreach item in array array['venues','profiles','classes','scheduled_shifts','shifts','timesheets','invoices','qualification_types'] loop
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=item and column_name='club_id' and data_type='uuid') then
      raise exception using errcode='P0001',message='Club architecture compatibility failed: public.'||item||'.club_id must be uuid';
    end if;
  end loop;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='venues' and column_name='legacy' and data_type='boolean') then
    raise exception using errcode='P0001',message='Club architecture compatibility failed: public.venues.legacy must be boolean';
  end if;
end
$ownership_compatibility$;

do $ownership_fks$
declare item text;constraint_name text;
begin
  foreach item in array array['venues','profiles','classes','scheduled_shifts','shifts','timesheets','invoices','qualification_types'] loop
    constraint_name:=item||'_club_fk';
    if not exists(select 1 from pg_constraint where conrelid=('public.'||item)::regclass and conname=constraint_name) then
      execute format('alter table public.%I add constraint %I foreign key(club_id) references public.clubs(id) on delete restrict not valid',item,constraint_name);
    end if;
  end loop;
end
$ownership_fks$;

do $backfill$
declare cid uuid;kid uuid;
begin
  select id into cid from public.clubs where lower(btrim(name))='kirklees trampoline gymnastics academy';
  select id into kid from public.venues where lower(btrim(slug))='kirklees';

  -- Greenhead and Other remain untouched legacy records and receive no club.
  update public.venues set club_id=cid,legacy=false where id=kid;
  update public.venues set club_id=null,legacy=true,active=false where id<>kid and lower(btrim(slug)) in ('greenhead','other','other-event');

  -- Existing staff and shared qualification configuration belong to Kirklees.
  update public.profiles set club_id=cid where club_id is null;
  update public.qualification_types set club_id=cid where club_id is null;

  -- Operational rows are migrated only when their legacy venue is Kirklees.
  update public.classes set club_id=cid where club_id is null and (venue_id=kid or venue_id is null);
  update public.scheduled_shifts set club_id=cid where club_id is null and (venue_id=kid or venue_id is null);
  update public.shifts set club_id=cid where club_id is null and (venue_id=kid or venue_id is null);
  update public.invoices i set club_id=cid where club_id is null and (venue_id=kid or venue_id is null) and exists(select 1 from public.profiles p where p.id=i.coach_id and p.club_id=cid);
  update public.timesheets t set club_id=cid where club_id is null and exists(select 1 from public.profiles p where p.id=t.coach_id and p.club_id=cid);

  if exists(select 1 from public.classes where club_id is null)
    or exists(select 1 from public.scheduled_shifts where club_id is null)
    or exists(select 1 from public.shifts where club_id is null)
    or exists(select 1 from public.timesheets where club_id is null)
    or exists(select 1 from public.invoices where club_id is null) then
    raise exception using errcode='P0001',message='Club architecture stopped: operational data exists outside Kirklees';
  end if;
end
$backfill$;

alter table public.profiles alter column club_id set not null;
alter table public.classes alter column club_id set not null;
alter table public.scheduled_shifts alter column club_id set not null;
alter table public.shifts alter column club_id set not null;
alter table public.timesheets alter column club_id set not null;
alter table public.invoices alter column club_id set not null;
alter table public.qualification_types alter column club_id set not null;

alter table public.venues validate constraint venues_club_fk;
alter table public.profiles validate constraint profiles_club_fk;
alter table public.classes validate constraint classes_club_fk;
alter table public.scheduled_shifts validate constraint scheduled_shifts_club_fk;
alter table public.shifts validate constraint shifts_club_fk;
alter table public.timesheets validate constraint timesheets_club_fk;
alter table public.invoices validate constraint invoices_club_fk;
alter table public.qualification_types validate constraint qualification_types_club_fk;

create index if not exists profiles_club_idx on public.profiles(club_id);
create index if not exists classes_club_idx on public.classes(club_id);
create index if not exists scheduled_shifts_club_date_idx on public.scheduled_shifts(club_id,shift_date);
create index if not exists shifts_club_date_idx on public.shifts(club_id,shift_date);
create index if not exists timesheets_club_month_idx on public.timesheets(club_id,month_start);
create index if not exists invoices_club_date_idx on public.invoices(club_id,invoice_date);
create index if not exists qualification_types_club_idx on public.qualification_types(club_id);

-- Introduce Club Owner while retaining every existing role during transition.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('coach','head_coach','welfare','finance','club_manager','club_owner','org_admin','admin'));
update public.profiles set role='club_owner' where role='admin';

create or replace function public.is_global_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','club_owner') and is_active=true);
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public as $$ select public.is_global_admin(); $$;
create or replace function public.current_club_id()
returns uuid language sql stable security definer set search_path=public as $$
  select club_id from public.profiles where id=auth.uid() and is_active=true;
$$;
revoke all on function public.current_club_id() from public;
grant execute on function public.current_club_id() to authenticated;

-- Existing insert paths remain valid while becoming club-aware automatically.
alter table public.profiles alter column club_id set default public.current_club_id();
alter table public.classes alter column club_id set default public.current_club_id();
alter table public.scheduled_shifts alter column club_id set default public.current_club_id();
alter table public.shifts alter column club_id set default public.current_club_id();
alter table public.timesheets alter column club_id set default public.current_club_id();
alter table public.invoices alter column club_id set default public.current_club_id();
alter table public.qualification_types alter column club_id set default public.current_club_id();

-- Qualification catalogue uniqueness is now isolated per club.
drop index if exists public.qualification_types_name_unique;
create unique index qualification_types_club_name_unique on public.qualification_types(club_id,lower(btrim(name)));
drop index if exists public.qualification_types_active_family_level_unique;
create unique index qualification_types_club_active_family_level_unique
  on public.qualification_types(club_id,lower(btrim(qualification_family)),qualification_level)
  where active=true and qualification_family is not null and btrim(qualification_family)<>'' and qualification_level is not null;

alter table public.clubs enable row level security;
do $club_policies$
begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='clubs' and policyname='clubs_member_read') then
    create policy clubs_member_read on public.clubs for select to authenticated using(id=public.current_club_id());
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='clubs' and policyname='clubs_owner_update') then
    create policy clubs_owner_update on public.clubs for update to authenticated using(id=public.current_club_id() and public.is_global_admin()) with check(id=public.current_club_id() and public.is_global_admin());
  end if;
end
$club_policies$;
grant select,update on public.clubs to authenticated;

notify pgrst,'reload schema';
commit;
