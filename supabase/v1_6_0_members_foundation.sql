-- Members Phase 1: additive foundation; no Auth users or existing business records changed.
begin;
set local lock_timeout='5s';
create function public.can_read_member_data(p_club uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $fn$
  select auth.uid() is not null and exists(
    select 1 from public.profiles p join public.clubs c on c.id=p.club_id
    where p.id=auth.uid() and p.club_id=p_club and p.is_active=true and c.active=true
      and p.role in ('club_owner','org_admin')
  );
$fn$;
alter function public.can_read_member_data(uuid) owner to postgres;
revoke all on function public.can_read_member_data(uuid) from public,anon,authenticated,service_role;
grant execute on function public.can_read_member_data(uuid) to authenticated;

create table public.member_families(
 id uuid primary key default gen_random_uuid(),
 club_id uuid not null references public.clubs(id) on delete restrict,
 display_name text not null check(length(btrim(display_name)) between 1 and 200),
 billing_address text,
 billing_contact_id uuid,
 status text not null default 'active' check(status in ('active','archived')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(club_id,id)
);
create table public.member_contacts(
 id uuid primary key default gen_random_uuid(),
 club_id uuid not null references public.clubs(id) on delete restrict,
 family_id uuid not null,
 display_name text not null check(length(btrim(display_name)) between 1 and 200),
 email text, phone text,
 communication_preferences jsonb not null default '{}'::jsonb check(jsonb_typeof(communication_preferences)='object'),
 -- Reserved linkage only; no parent portal access or Auth creation in this release.
 auth_user_id uuid references auth.users(id) on delete set null,
 status text not null default 'active' check(status in ('active','archived')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(club_id,id), unique(club_id,family_id,id),
 foreign key(club_id,family_id) references public.member_families(club_id,id) on delete restrict
);
alter table public.member_families add constraint member_families_billing_contact_fk
 foreign key(club_id,id,billing_contact_id) references public.member_contacts(club_id,family_id,id) on delete restrict;
create unique index member_contacts_auth_idx on public.member_contacts(club_id,auth_user_id) where auth_user_id is not null;
create table public.member_athletes(
 id uuid primary key default gen_random_uuid(),
 club_id uuid not null references public.clubs(id) on delete restrict,
 family_id uuid not null,
 display_name text not null check(length(btrim(display_name)) between 1 and 200),
 date_of_birth date,
 medical_notes text,
 status text not null default 'active' check(status in ('active','archived')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(club_id,id),
 foreign key(club_id,family_id) references public.member_families(club_id,id) on delete restrict
);
create table public.member_athlete_contacts(
 id uuid primary key default gen_random_uuid(),
 club_id uuid not null references public.clubs(id) on delete restrict,
 athlete_id uuid not null, contact_id uuid not null,
 relationship text not null check(relationship in ('parent','guardian','self','other')),
 is_primary boolean not null default false,
 is_emergency boolean not null default false,
 status text not null default 'active' check(status in ('active','archived')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(club_id,athlete_id,contact_id),
 foreign key(club_id,athlete_id) references public.member_athletes(club_id,id) on delete restrict,
 foreign key(club_id,contact_id) references public.member_contacts(club_id,id) on delete restrict
);
create unique index member_athlete_contacts_primary_idx on public.member_athlete_contacts(club_id,athlete_id) where is_primary and status='active';
create index member_contacts_family_idx on public.member_contacts(club_id,family_id);
create index member_athletes_family_idx on public.member_athletes(club_id,family_id);
create index member_athlete_contacts_contact_idx on public.member_athlete_contacts(club_id,contact_id);

create function public.member_record_stamp()
returns trigger language plpgsql set search_path=pg_catalog,public as $fn$
begin
 if new.club_id is distinct from old.club_id or new.id is distinct from old.id then
   raise exception using errcode='23514',message='Member identity and tenant ownership cannot be changed';
 end if;
 new.created_at:=old.created_at;
 new.updated_at:=now();
 return new;
end
$fn$;
alter function public.member_record_stamp() owner to postgres;
revoke all on function public.member_record_stamp() from public,anon,authenticated,service_role;

create index member_families_status_idx on public.member_families(club_id,status);
create trigger member_families_stamp before update on public.member_families for each row execute function public.member_record_stamp();
alter table public.member_families enable row level security;
alter table public.member_families force row level security;
revoke all on public.member_families from public,anon,authenticated,service_role;
create policy member_families_read on public.member_families for select to authenticated using(public.can_read_member_data(club_id));

create index member_contacts_status_idx on public.member_contacts(club_id,status);
create trigger member_contacts_stamp before update on public.member_contacts for each row execute function public.member_record_stamp();
alter table public.member_contacts enable row level security;
alter table public.member_contacts force row level security;
revoke all on public.member_contacts from public,anon,authenticated,service_role;
create policy member_contacts_read on public.member_contacts for select to authenticated using(public.can_read_member_data(club_id));

create index member_athletes_status_idx on public.member_athletes(club_id,status);
create trigger member_athletes_stamp before update on public.member_athletes for each row execute function public.member_record_stamp();
alter table public.member_athletes enable row level security;
alter table public.member_athletes force row level security;
revoke all on public.member_athletes from public,anon,authenticated,service_role;
create policy member_athletes_read on public.member_athletes for select to authenticated using(public.can_read_member_data(club_id));

create index member_athlete_contacts_status_idx on public.member_athlete_contacts(club_id,status);
create trigger member_athlete_contacts_stamp before update on public.member_athlete_contacts for each row execute function public.member_record_stamp();
alter table public.member_athlete_contacts enable row level security;
alter table public.member_athlete_contacts force row level security;
revoke all on public.member_athlete_contacts from public,anon,authenticated,service_role;
create policy member_athlete_contacts_read on public.member_athlete_contacts for select to authenticated using(public.can_read_member_data(club_id));

grant select(id,club_id,display_name,status) on public.member_families to authenticated;
grant select(id,club_id,family_id,display_name,status) on public.member_athletes to authenticated;
-- Contacts and relationship records intentionally have no API SELECT grant yet.
-- Future lifecycle records should reference (club_id,athlete_id); enrolment state
-- belongs to each programme participation, not a single global athlete status.
commit;
