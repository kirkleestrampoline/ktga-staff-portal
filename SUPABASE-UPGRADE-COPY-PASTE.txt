-- KTGA STAFF PORTAL v0.3 - MONTH ONE DATABASE UPGRADE
-- Run this ONCE after the original setup.sql.

begin;

alter table public.profiles add column if not exists emergency_contact_name text;
alter table public.profiles add column if not exists emergency_contact_phone text;
alter table public.profiles add column if not exists dbs_expiry date;
alter table public.profiles add column if not exists first_aid_expiry date;
alter table public.profiles add column if not exists safeguarding_expiry date;
alter table public.profiles add column if not exists qualifications text;

-- Invoice numbers only need to be unique for each coach.
alter table public.invoices drop constraint if exists invoices_invoice_number_key;
create unique index if not exists invoices_coach_number_uq on public.invoices(coach_id,invoice_number);

-- Coaches may edit their profile row, but these admin-controlled fields are preserved.
create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid()=old.id and not public.is_admin() then
    new.role:=old.role;
    new.hourly_rate:=old.hourly_rate;
    new.is_active:=old.is_active;
    new.email:=old.email;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_admin_fields_trigger on public.profiles;
create trigger protect_profile_admin_fields_trigger
before update on public.profiles
for each row execute function public.protect_profile_admin_fields();

-- Coaches cannot change shifts once a month is submitted/paid.
create or replace function public.guard_shift_change()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  c uuid;
  d date;
  st text;
begin
  if public.is_admin() then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if tg_op='DELETE' then
    c:=old.coach_id; d:=old.shift_date;
  else
    c:=new.coach_id; d:=new.shift_date;
  end if;

  if c<>auth.uid() then raise exception 'You can only edit your own shifts'; end if;

  select status into st
  from public.timesheets
  where coach_id=c and month_start=date_trunc('month',d)::date;

  if st in ('submitted','paid') then
    raise exception 'This month is locked. Unsubmit it before editing.';
  end if;

  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists guard_shift_change_trigger on public.shifts;
create trigger guard_shift_change_trigger
before insert or update or delete on public.shifts
for each row execute function public.guard_shift_change();

-- Coaches can read their timesheet/invoice, but direct writes are admin-only.
-- Coach submission changes happen through the secure RPC functions below.
drop policy if exists timesheets_insert on public.timesheets;
drop policy if exists timesheets_update on public.timesheets;
create policy timesheets_admin_insert on public.timesheets
for insert to authenticated with check(public.is_admin());
create policy timesheets_admin_update on public.timesheets
for update to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists invoices_insert on public.invoices;
drop policy if exists invoices_update on public.invoices;
drop policy if exists invoices_update_admin on public.invoices;
drop policy if exists invoices_delete on public.invoices;
create policy invoices_admin_insert on public.invoices
for insert to authenticated with check(public.is_admin());
create policy invoices_admin_update on public.invoices
for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy invoices_admin_delete on public.invoices
for delete to authenticated using(public.is_admin());

-- Audit trail.
create table if not exists public.audit_log(
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  subject_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;
drop policy if exists audit_admin_select on public.audit_log;
create policy audit_admin_select on public.audit_log
for select to authenticated using(public.is_admin());
grant select on public.audit_log to authenticated;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  subj uuid;
  ent uuid;
  oldj jsonb;
  newj jsonb;
begin
  if tg_op='INSERT' then
    newj:=to_jsonb(new); oldj:='{}'::jsonb;
    ent:=new.id;
    if tg_table_name='profiles' then subj:=new.id; else subj:=new.coach_id; end if;
  elsif tg_op='UPDATE' then
    newj:=to_jsonb(new); oldj:=to_jsonb(old);
    ent:=new.id;
    if tg_table_name='profiles' then subj:=new.id; else subj:=new.coach_id; end if;
  else
    newj:='{}'::jsonb; oldj:=to_jsonb(old);
    ent:=old.id;
    if tg_table_name='profiles' then subj:=old.id; else subj:=old.coach_id; end if;
  end if;

  insert into public.audit_log(actor_id,subject_id,action,entity_type,entity_id,details)
  values(auth.uid(),subj,lower(tg_op)||'_'||tg_table_name,tg_table_name,ent,'{}'::jsonb);

  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles after update on public.profiles
for each row execute function public.audit_row_change();

drop trigger if exists audit_shifts on public.shifts;
create trigger audit_shifts after insert or update or delete on public.shifts
for each row execute function public.audit_row_change();

drop trigger if exists audit_timesheets on public.timesheets;
create trigger audit_timesheets after insert or update or delete on public.timesheets
for each row execute function public.audit_row_change();

drop trigger if exists audit_invoices on public.invoices;
create trigger audit_invoices after insert or update or delete on public.invoices
for each row execute function public.audit_row_change();

-- Coach submission. Hours and rate are calculated in the database.
create or replace function public.submit_own_timesheet(p_month_start date)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  tsid uuid;
  hrs numeric(10,2);
  rate numeric(10,2);
  total numeric(10,2);
  pref text;
  invno text;
begin
  if uid is null then raise exception 'Not signed in'; end if;

  p_month_start:=date_trunc('month',p_month_start)::date;

  select round(coalesce(sum(
    greatest(
      0,
      extract(epoch from (
        (shift_date + finish_time
          + case when finish_time < start_time then interval '1 day' else interval '0 day' end)
        - (shift_date + start_time)
      ))/3600.0 - break_minutes/60.0
    )
  ),0)::numeric,2)
  into hrs
  from public.shifts
  where coach_id=uid
    and shift_date>=p_month_start
    and shift_date<(p_month_start+interval '1 month')::date;

  if hrs<=0 then raise exception 'Add at least one valid shift before submitting'; end if;

  select hourly_rate,
         coalesce(nullif(invoice_prefix,''),upper(left(regexp_replace(full_name,'\s','','g'),3)))
  into rate,pref
  from public.profiles
  where id=uid and is_active=true;

  if rate is null then raise exception 'Your staff profile is not active'; end if;

  total:=round(hrs*rate,2);

  insert into public.timesheets(coach_id,month_start,status,submitted_at,paid_at)
  values(uid,p_month_start,'submitted',now(),null)
  on conflict(coach_id,month_start)
  do update set status='submitted',submitted_at=now(),paid_at=null,updated_at=now()
  returning id into tsid;

  invno:=coalesce(pref,'INV')||'-'||to_char(p_month_start,'YYYYMM');

  insert into public.invoices(coach_id,timesheet_id,invoice_number,invoice_date,hours,hourly_rate,total_amount,status)
  values(uid,tsid,invno,current_date,hrs,rate,total,'awaiting_payment')
  on conflict(timesheet_id)
  do update set invoice_number=excluded.invoice_number,invoice_date=excluded.invoice_date,
                hours=excluded.hours,hourly_rate=excluded.hourly_rate,
                total_amount=excluded.total_amount,status='awaiting_payment';

  return tsid;
end;
$$;

create or replace function public.unsubmit_own_timesheet(p_month_start date)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  tsid uuid;
  st text;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  p_month_start:=date_trunc('month',p_month_start)::date;

  select id,status into tsid,st
  from public.timesheets
  where coach_id=uid and month_start=p_month_start;

  if tsid is null then return; end if;
  if st='paid' then raise exception 'Paid months cannot be unsubmitted'; end if;

  delete from public.invoices where timesheet_id=tsid;
  update public.timesheets
  set status='draft',submitted_at=null,updated_at=now()
  where id=tsid;
end;
$$;

-- Admin-only reopen / mark paid.
create or replace function public.admin_reopen_timesheet(p_timesheet_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  delete from public.invoices where timesheet_id=p_timesheet_id;
  update public.timesheets
  set status='draft',submitted_at=null,paid_at=null,updated_at=now()
  where id=p_timesheet_id;
end;
$$;

create or replace function public.admin_mark_timesheet_paid(p_timesheet_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  update public.timesheets
  set status='paid',paid_at=now(),updated_at=now()
  where id=p_timesheet_id and status='submitted';

  update public.invoices
  set status='paid'
  where timesheet_id=p_timesheet_id;
end;
$$;

grant execute on function public.submit_own_timesheet(date) to authenticated;
grant execute on function public.unsubmit_own_timesheet(date) to authenticated;
grant execute on function public.admin_reopen_timesheet(uuid) to authenticated;
grant execute on function public.admin_mark_timesheet_paid(uuid) to authenticated;

commit;
