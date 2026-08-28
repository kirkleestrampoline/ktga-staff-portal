-- AV GYMNASTICS SOLUTIONS v1.1 LAUNCH FEATURES
-- Run ONCE after v1_av_venues_mobile_auth.sql.

begin;

-- Organisations are stored in the existing venues table so existing shift data remains compatible.
alter table public.venues add column if not exists legal_name text;
alter table public.venues add column if not exists invoice_address text;
alter table public.venues add column if not exists invoice_prefix text;
alter table public.venues add column if not exists payment_note text default 'Payment by bank transfer';

update public.venues set
  legal_name=coalesce(legal_name,case slug when 'kirklees' then 'Kirklees Trampoline Gymnastics Academy Ltd' when 'greenhead' then 'Greenhead Gymnastics Club' else name end),
  invoice_prefix=coalesce(invoice_prefix,case slug when 'kirklees' then 'KTGA' when 'greenhead' then 'GH' else upper(left(regexp_replace(name,'[^A-Za-z0-9]','','g'),4)) end)
where legal_name is null or invoice_prefix is null;

-- Organisation-admin scope lives on each staff/organisation membership.
alter table public.staff_venues add column if not exists is_admin boolean not null default false;

-- Allow an organisation-admin account type.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('coach','org_admin','admin'));

-- Record who submitted a month.
alter table public.timesheets add column if not exists submitted_by uuid references public.profiles(id) on delete set null;

-- Split one monthly submission into one invoice per organisation.
alter table public.invoices add column if not exists venue_id uuid references public.venues(id) on delete set null;
alter table public.invoices drop constraint if exists invoices_timesheet_id_key;
drop index if exists invoices_timesheet_id_key;
create unique index if not exists invoices_timesheet_venue_uq on public.invoices(timesheet_id,venue_id) where venue_id is not null;

-- Regular weekly shift templates.
create table if not exists public.shift_templates(
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  weekday integer not null check(weekday between 0 and 6),
  start_time time not null,
  finish_time time not null,
  break_minutes integer not null default 0 check(break_minutes>=0),
  session_location text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists shift_templates_profile_idx on public.shift_templates(profile_id);
alter table public.shift_templates enable row level security;

-- SECURITY HELPERS -----------------------------------------------------------
create or replace function public.is_global_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and is_active=true);
$$;

create or replace function public.is_venue_admin(p_venue uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_global_admin() or exists(
    select 1 from public.staff_venues sv
    join public.profiles p on p.id=sv.profile_id
    where sv.profile_id=auth.uid() and sv.venue_id=p_venue and sv.is_admin=true
      and p.role='org_admin' and p.is_active=true
  );
$$;

create or replace function public.can_manage_profile(p_profile uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_global_admin() or exists(
    select 1
    from public.staff_venues mine
    join public.staff_venues theirs on theirs.venue_id=mine.venue_id
    join public.profiles me on me.id=mine.profile_id
    where mine.profile_id=auth.uid() and mine.is_admin=true and theirs.profile_id=p_profile
      and me.role='org_admin' and me.is_active=true
  );
$$;

-- Keep legacy helper meaning GLOBAL admin only; prevents old broad policies from leaking cross-org data.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_global_admin();
$$;

-- RLS ------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using(id=auth.uid() or public.can_manage_profile(id));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
using(id=auth.uid() or public.can_manage_profile(id))
with check(id=auth.uid() or public.can_manage_profile(id));

drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts for select to authenticated
using(coach_id=auth.uid() or public.is_global_admin() or (venue_id is not null and public.is_venue_admin(venue_id)));
drop policy if exists shifts_insert on public.shifts;
create policy shifts_insert on public.shifts for insert to authenticated
with check(coach_id=auth.uid() or public.is_global_admin() or (venue_id is not null and public.is_venue_admin(venue_id)));
drop policy if exists shifts_update on public.shifts;
create policy shifts_update on public.shifts for update to authenticated
using(coach_id=auth.uid() or public.is_global_admin() or (venue_id is not null and public.is_venue_admin(venue_id)))
with check(coach_id=auth.uid() or public.is_global_admin() or (venue_id is not null and public.is_venue_admin(venue_id)));
drop policy if exists shifts_delete on public.shifts;
create policy shifts_delete on public.shifts for delete to authenticated
using(coach_id=auth.uid() or public.is_global_admin() or (venue_id is not null and public.is_venue_admin(venue_id)));

drop policy if exists timesheets_select on public.timesheets;
create policy timesheets_select on public.timesheets for select to authenticated
using(coach_id=auth.uid() or public.can_manage_profile(coach_id));

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select to authenticated
using(coach_id=auth.uid() or public.is_global_admin() or (venue_id is not null and public.is_venue_admin(venue_id)));

-- Organisation settings can be changed by its organisation admin.
drop policy if exists venues_admin_update on public.venues;
create policy venues_admin_update on public.venues for update to authenticated
using(public.is_global_admin() or public.is_venue_admin(id))
with check(public.is_global_admin() or public.is_venue_admin(id));

drop policy if exists staff_venues_read on public.staff_venues;
create policy staff_venues_read on public.staff_venues for select to authenticated
using(profile_id=auth.uid() or public.is_global_admin() or public.is_venue_admin(venue_id));
drop policy if exists staff_venues_insert on public.staff_venues;
create policy staff_venues_insert on public.staff_venues for insert to authenticated
with check(public.is_global_admin() or ((profile_id=auth.uid() or public.is_venue_admin(venue_id)) and is_admin=false));
drop policy if exists staff_venues_delete on public.staff_venues;
create policy staff_venues_delete on public.staff_venues for delete to authenticated
using(public.is_global_admin() or ((profile_id=auth.uid() or public.is_venue_admin(venue_id)) and is_admin=false));

drop policy if exists shift_templates_select on public.shift_templates;
create policy shift_templates_select on public.shift_templates for select to authenticated
using(profile_id=auth.uid() or public.is_global_admin() or public.is_venue_admin(venue_id));
drop policy if exists shift_templates_insert on public.shift_templates;
create policy shift_templates_insert on public.shift_templates for insert to authenticated
with check(profile_id=auth.uid() or public.is_global_admin() or public.is_venue_admin(venue_id));
drop policy if exists shift_templates_update on public.shift_templates;
create policy shift_templates_update on public.shift_templates for update to authenticated
using(profile_id=auth.uid() or public.is_global_admin() or public.is_venue_admin(venue_id))
with check(profile_id=auth.uid() or public.is_global_admin() or public.is_venue_admin(venue_id));
drop policy if exists shift_templates_delete on public.shift_templates;
create policy shift_templates_delete on public.shift_templates for delete to authenticated
using(profile_id=auth.uid() or public.is_global_admin() or public.is_venue_admin(venue_id));
grant select,insert,update,delete on public.shift_templates to authenticated;

-- Coaches still cannot change their own controlled fields.
create or replace function public.protect_profile_admin_fields()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not public.is_global_admin() then
    new.role:=old.role;
    new.email:=old.email;
    if auth.uid()=old.id then
      new.hourly_rate:=old.hourly_rate;
      new.is_active:=old.is_active;
    end if;
  end if;
  return new;
end; $$;

-- Keep audit useful without copying bank/account/UTR data into history.
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare subj uuid; ent uuid; safe jsonb;
begin
  if tg_op='DELETE' then
    ent:=old.id;
    if tg_table_name='profiles' then subj:=old.id; else subj:=old.coach_id; end if;
  else
    ent:=new.id;
    if tg_table_name='profiles' then subj:=new.id; else subj:=new.coach_id; end if;
  end if;
  safe:=jsonb_build_object('table',tg_table_name,'operation',tg_op);
  if tg_table_name='shifts' then
    if tg_op='DELETE' then safe:=safe||jsonb_build_object('shift_date',old.shift_date,'venue_id',old.venue_id); else safe:=safe||jsonb_build_object('shift_date',new.shift_date,'venue_id',new.venue_id); end if;
  end if;
  if tg_table_name='timesheets' then
    if tg_op='DELETE' then safe:=safe||jsonb_build_object('month_start',old.month_start,'status',old.status); else safe:=safe||jsonb_build_object('month_start',new.month_start,'status',new.status); end if;
  end if;
  if tg_table_name='invoices' then
    if tg_op='DELETE' then safe:=safe||jsonb_build_object('invoice_number',old.invoice_number,'venue_id',old.venue_id,'status',old.status); else safe:=safe||jsonb_build_object('invoice_number',new.invoice_number,'venue_id',new.venue_id,'status',new.status); end if;
  end if;
  insert into public.audit_log(actor_id,subject_id,action,entity_type,entity_id,details)
  values(auth.uid(),subj,lower(tg_op)||'_'||tg_table_name,tg_table_name,ent,safe);
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;

-- SUBMISSION / SPLIT INVOICES -------------------------------------------------
create or replace function public.build_timesheet_invoices(p_coach uuid,p_month date,p_actor uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  tsid uuid; rate numeric(10,2); coachpref text; rec record; invno text;
begin
  p_month:=date_trunc('month',p_month)::date;
  select hourly_rate,coalesce(nullif(invoice_prefix,''),upper(left(regexp_replace(full_name,'[^A-Za-z0-9]','','g'),3)))
    into rate,coachpref from public.profiles where id=p_coach and is_active=true;
  if rate is null then raise exception 'Staff profile is not active'; end if;
  if not exists(select 1 from public.shifts where coach_id=p_coach and shift_date>=p_month and shift_date<(p_month+interval '1 month')::date)
    then raise exception 'Add at least one shift before submitting'; end if;
  if exists(select 1 from public.shifts where coach_id=p_coach and shift_date>=p_month and shift_date<(p_month+interval '1 month')::date and venue_id is null)
    then raise exception 'Every shift needs an organisation before submission'; end if;

  insert into public.timesheets(coach_id,month_start,status,submitted_at,paid_at,submitted_by)
  values(p_coach,p_month,'submitted',now(),null,p_actor)
  on conflict(coach_id,month_start) do update
    set status='submitted',submitted_at=now(),paid_at=null,submitted_by=p_actor,updated_at=now()
  returning id into tsid;

  delete from public.invoices where timesheet_id=tsid;

  for rec in
    select s.venue_id,
      round(sum(greatest(0,extract(epoch from((s.shift_date+s.finish_time+case when s.finish_time<s.start_time then interval '1 day' else interval '0 day' end)-(s.shift_date+s.start_time)))/3600.0-s.break_minutes/60.0))::numeric,2) hrs,
      coalesce(nullif(v.invoice_prefix,''),upper(left(regexp_replace(v.name,'[^A-Za-z0-9]','','g'),4))) orgpref
    from public.shifts s join public.venues v on v.id=s.venue_id
    where s.coach_id=p_coach and s.shift_date>=p_month and s.shift_date<(p_month+interval '1 month')::date
    group by s.venue_id,v.invoice_prefix,v.name
  loop
    invno:=coalesce(coachpref,'INV')||'-'||coalesce(rec.orgpref,'ORG')||'-'||to_char(p_month,'YYYYMM');
    insert into public.invoices(coach_id,timesheet_id,venue_id,invoice_number,invoice_date,hours,hourly_rate,total_amount,status)
    values(p_coach,tsid,rec.venue_id,invno,current_date,rec.hrs,rate,round(rec.hrs*rate,2),'awaiting_payment');
  end loop;
  return tsid;
end; $$;

create or replace function public.submit_own_timesheet(p_month_start date)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  return public.build_timesheet_invoices(auth.uid(),p_month_start,auth.uid());
end; $$;

create or replace function public.admin_submit_timesheet(p_coach_id uuid,p_month_start date)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  if not public.can_manage_profile(p_coach_id) then raise exception 'You do not have permission to submit for this staff member'; end if;
  -- Organisation admins may only submit if every shift in the month is within an organisation they manage.
  if not public.is_global_admin() and exists(
    select 1 from public.shifts s where s.coach_id=p_coach_id
      and s.shift_date>=date_trunc('month',p_month_start)::date
      and s.shift_date<(date_trunc('month',p_month_start)+interval '1 month')::date
      and not public.is_venue_admin(s.venue_id)
  ) then raise exception 'This month contains shifts outside your organisation'; end if;
  return public.build_timesheet_invoices(p_coach_id,p_month_start,auth.uid());
end; $$;

create or replace function public.unsubmit_own_timesheet(p_month_start date)
returns void language plpgsql security definer set search_path=public as $$
declare tsid uuid; st text;
begin
  select id,status into tsid,st from public.timesheets where coach_id=auth.uid() and month_start=date_trunc('month',p_month_start)::date;
  if tsid is null then return; end if;
  if st='paid' then raise exception 'Paid months cannot be unsubmitted'; end if;
  delete from public.invoices where timesheet_id=tsid;
  update public.timesheets set status='draft',submitted_at=null,submitted_by=null,updated_at=now() where id=tsid;
end; $$;

create or replace function public.admin_reopen_timesheet(p_timesheet_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
  select coach_id into cid from public.timesheets where id=p_timesheet_id;
  if not public.can_manage_profile(cid) then raise exception 'No permission'; end if;
  delete from public.invoices where timesheet_id=p_timesheet_id;
  update public.timesheets set status='draft',submitted_at=null,submitted_by=null,paid_at=null,updated_at=now() where id=p_timesheet_id;
end; $$;

create or replace function public.admin_mark_timesheet_paid(p_timesheet_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
  select coach_id into cid from public.timesheets where id=p_timesheet_id;
  if not public.can_manage_profile(cid) then raise exception 'No permission'; end if;
  if not public.is_global_admin() and exists(select 1 from public.invoices i where i.timesheet_id=p_timesheet_id and not public.is_venue_admin(i.venue_id))
    then raise exception 'Only the super admin can mark a multi-organisation month fully paid'; end if;
  update public.timesheets set status='paid',paid_at=now(),updated_at=now() where id=p_timesheet_id and status='submitted';
  update public.invoices set status='paid' where timesheet_id=p_timesheet_id;
end; $$;

create or replace function public.admin_mark_invoice_paid(p_invoice_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare vid uuid; tsid uuid;
begin
  select venue_id,timesheet_id into vid,tsid from public.invoices where id=p_invoice_id;
  if vid is null or not public.is_venue_admin(vid) then raise exception 'No permission'; end if;
  update public.invoices set status='paid' where id=p_invoice_id;
  if not exists(select 1 from public.invoices where timesheet_id=tsid and status<>'paid') then
    update public.timesheets set status='paid',paid_at=now(),updated_at=now() where id=tsid;
  end if;
end; $$;

grant execute on function public.submit_own_timesheet(date) to authenticated;
grant execute on function public.admin_submit_timesheet(uuid,date) to authenticated;
grant execute on function public.unsubmit_own_timesheet(date) to authenticated;
grant execute on function public.admin_reopen_timesheet(uuid) to authenticated;
grant execute on function public.admin_mark_timesheet_paid(uuid) to authenticated;
grant execute on function public.admin_mark_invoice_paid(uuid) to authenticated;

commit;
