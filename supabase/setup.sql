begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  address text,
  role text not null default 'coach' check (role in ('coach','admin')),
  hourly_rate numeric(10,2) not null default 0,
  account_name text,
  sort_code text,
  account_number text,
  utr text,
  invoice_prefix text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,full_name,email)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),new.email)
 on conflict(id) do nothing;
 return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and is_active=true);
$$;

create table if not exists public.business_settings(
 id integer primary key default 1 check(id=1),
 business_name text not null default 'Kirklees Trampoline Gymnastics Academy Ltd',
 business_address text,
 payment_note text default 'Payment by bank transfer',
 cutoff_day integer not null default 1 check(cutoff_day between 1 and 28),
 updated_at timestamptz not null default now()
);
insert into public.business_settings(id) values(1) on conflict(id) do nothing;

create table if not exists public.shifts(
 id uuid primary key default gen_random_uuid(),
 coach_id uuid not null references public.profiles(id) on delete cascade,
 shift_date date not null,
 start_time time not null,
 finish_time time not null,
 break_minutes integer not null default 0 check(break_minutes>=0),
 session_location text,
 notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists shifts_coach_date_idx on public.shifts(coach_id,shift_date);

create table if not exists public.timesheets(
 id uuid primary key default gen_random_uuid(),
 coach_id uuid not null references public.profiles(id) on delete cascade,
 month_start date not null,
 status text not null default 'draft' check(status in ('draft','submitted','paid')),
 submitted_at timestamptz,
 paid_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(coach_id,month_start),
 check(extract(day from month_start)=1)
);

create table if not exists public.invoices(
 id uuid primary key default gen_random_uuid(),
 coach_id uuid not null references public.profiles(id) on delete cascade,
 timesheet_id uuid not null unique references public.timesheets(id) on delete cascade,
 invoice_number text not null unique,
 invoice_date date not null default current_date,
 hours numeric(10,2) not null default 0,
 hourly_rate numeric(10,2) not null default 0,
 total_amount numeric(10,2) not null default 0,
 status text not null default 'awaiting_payment' check(status in ('awaiting_payment','paid','cancelled')),
 created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.business_settings enable row level security;
alter table public.shifts enable row level security;
alter table public.timesheets enable row level security;
alter table public.invoices enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());

-- IMPORTANT: coaches may update their own personal/payment details, but cannot change role/rate in normal UI.
-- RLS controls row access; admin-only rate/role changes happen via trusted server/admin workflows.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid() or public.is_admin()) with check(id=auth.uid() or public.is_admin());

drop policy if exists business_select on public.business_settings;
create policy business_select on public.business_settings for select to authenticated using(true);
drop policy if exists business_update on public.business_settings;
create policy business_update on public.business_settings for update to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts for select to authenticated using(coach_id=auth.uid() or public.is_admin());
drop policy if exists shifts_insert on public.shifts;
create policy shifts_insert on public.shifts for insert to authenticated with check(coach_id=auth.uid() or public.is_admin());
drop policy if exists shifts_update on public.shifts;
create policy shifts_update on public.shifts for update to authenticated using(coach_id=auth.uid() or public.is_admin()) with check(coach_id=auth.uid() or public.is_admin());
drop policy if exists shifts_delete on public.shifts;
create policy shifts_delete on public.shifts for delete to authenticated using(coach_id=auth.uid() or public.is_admin());

drop policy if exists timesheets_select on public.timesheets;
create policy timesheets_select on public.timesheets for select to authenticated using(coach_id=auth.uid() or public.is_admin());
drop policy if exists timesheets_insert on public.timesheets;
create policy timesheets_insert on public.timesheets for insert to authenticated with check(coach_id=auth.uid() or public.is_admin());
drop policy if exists timesheets_update on public.timesheets;
create policy timesheets_update on public.timesheets for update to authenticated using(coach_id=auth.uid() or public.is_admin()) with check(coach_id=auth.uid() or public.is_admin());

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select to authenticated using(coach_id=auth.uid() or public.is_admin());
drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices for insert to authenticated with check(coach_id=auth.uid() or public.is_admin());
drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices for update to authenticated using(coach_id=auth.uid() or public.is_admin()) with check(coach_id=auth.uid() or public.is_admin());
drop policy if exists invoices_delete on public.invoices;
create policy invoices_delete on public.invoices for delete to authenticated using(coach_id=auth.uid() or public.is_admin());

grant usage on schema public to authenticated;
grant select,update on public.profiles to authenticated;
grant select,update on public.business_settings to authenticated;
grant select,insert,update,delete on public.shifts to authenticated;
grant select,insert,update on public.timesheets to authenticated;
grant select,insert,update,delete on public.invoices to authenticated;

commit;

-- AFTER you create your own Auth user, make yourself admin:
-- update public.profiles set role='admin' where email='YOUR_EMAIL_HERE';
