-- AV GYMNASTICS SOLUTIONS v1.2 - SCHEDULE & STAFFING
-- Run once after v1.1.1 final fixes.

begin;

create table if not exists public.classes(
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  weekday integer not null check(weekday between 0 and 6),
  start_time time not null,
  finish_time time not null,
  break_minutes integer not null default 0 check(break_minutes >= 0),
  coaches_required integer not null default 1 check(coaches_required between 1 and 12),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists classes_venue_idx on public.classes(venue_id);

create table if not exists public.class_staffing_slots(
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  slot_number integer not null check(slot_number > 0),
  default_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(class_id, slot_number)
);
create index if not exists class_staffing_class_idx on public.class_staffing_slots(class_id);

create table if not exists public.scheduled_shifts(
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes(id) on delete set null,
  staffing_slot_id uuid references public.class_staffing_slots(id) on delete set null,
  venue_id uuid not null references public.venues(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  original_profile_id uuid references public.profiles(id) on delete set null,
  shift_date date not null,
  start_time time not null,
  finish_time time not null,
  break_minutes integer not null default 0 check(break_minutes >= 0),
  class_name text not null,
  status text not null default 'scheduled' check(status in ('scheduled','confirmed','cancelled')),
  actual_shift_id uuid references public.shifts(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(staffing_slot_id, shift_date)
);
create index if not exists scheduled_shifts_date_idx on public.scheduled_shifts(shift_date);
create index if not exists scheduled_shifts_profile_idx on public.scheduled_shifts(profile_id,shift_date);
create index if not exists scheduled_shifts_venue_idx on public.scheduled_shifts(venue_id,shift_date);

alter table public.classes enable row level security;
alter table public.class_staffing_slots enable row level security;
alter table public.scheduled_shifts enable row level security;

grant select,insert,update,delete on public.classes to authenticated;
grant select,insert,update,delete on public.class_staffing_slots to authenticated;
grant select,insert,update,delete on public.scheduled_shifts to authenticated;

-- Classes and default staffing are organisation-admin data.
drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes for select to authenticated
using(public.is_global_admin() or public.is_venue_admin(venue_id) or exists(
  select 1 from public.staff_venues sv where sv.profile_id=auth.uid() and sv.venue_id=classes.venue_id
));
drop policy if exists classes_insert on public.classes;
create policy classes_insert on public.classes for insert to authenticated
with check(public.is_global_admin() or public.is_venue_admin(venue_id));
drop policy if exists classes_update on public.classes;
create policy classes_update on public.classes for update to authenticated
using(public.is_global_admin() or public.is_venue_admin(venue_id))
with check(public.is_global_admin() or public.is_venue_admin(venue_id));
drop policy if exists classes_delete on public.classes;
create policy classes_delete on public.classes for delete to authenticated
using(public.is_global_admin() or public.is_venue_admin(venue_id));

drop policy if exists class_staffing_select on public.class_staffing_slots;
create policy class_staffing_select on public.class_staffing_slots for select to authenticated
using(exists(select 1 from public.classes c where c.id=class_id and (
  public.is_global_admin() or public.is_venue_admin(c.venue_id) or exists(
    select 1 from public.staff_venues sv where sv.profile_id=auth.uid() and sv.venue_id=c.venue_id
  )
)));
drop policy if exists class_staffing_insert on public.class_staffing_slots;
create policy class_staffing_insert on public.class_staffing_slots for insert to authenticated
with check(exists(select 1 from public.classes c where c.id=class_id and (public.is_global_admin() or public.is_venue_admin(c.venue_id))));
drop policy if exists class_staffing_update on public.class_staffing_slots;
create policy class_staffing_update on public.class_staffing_slots for update to authenticated
using(exists(select 1 from public.classes c where c.id=class_id and (public.is_global_admin() or public.is_venue_admin(c.venue_id))))
with check(exists(select 1 from public.classes c where c.id=class_id and (public.is_global_admin() or public.is_venue_admin(c.venue_id))));
drop policy if exists class_staffing_delete on public.class_staffing_slots;
create policy class_staffing_delete on public.class_staffing_slots for delete to authenticated
using(exists(select 1 from public.classes c where c.id=class_id and (public.is_global_admin() or public.is_venue_admin(c.venue_id))));

-- Coaches can see their own scheduled work. Organisation admins see their organisation.
drop policy if exists scheduled_shifts_select on public.scheduled_shifts;
create policy scheduled_shifts_select on public.scheduled_shifts for select to authenticated
using(profile_id=auth.uid() or public.is_global_admin() or public.is_venue_admin(venue_id));
drop policy if exists scheduled_shifts_insert on public.scheduled_shifts;
create policy scheduled_shifts_insert on public.scheduled_shifts for insert to authenticated
with check(public.is_global_admin() or public.is_venue_admin(venue_id));
drop policy if exists scheduled_shifts_update on public.scheduled_shifts;
create policy scheduled_shifts_update on public.scheduled_shifts for update to authenticated
using(profile_id=auth.uid() or public.is_global_admin() or public.is_venue_admin(venue_id))
with check(profile_id=auth.uid() or public.is_global_admin() or public.is_venue_admin(venue_id));
drop policy if exists scheduled_shifts_delete on public.scheduled_shifts;
create policy scheduled_shifts_delete on public.scheduled_shifts for delete to authenticated
using(public.is_global_admin() or public.is_venue_admin(venue_id));

-- Generate a selected month from the recurring class timetable.
create or replace function public.generate_schedule_month(p_month_start date)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  d date;
  month_end date;
  c record;
  s record;
  inserted_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  p_month_start:=date_trunc('month',p_month_start)::date;
  month_end:=(p_month_start+interval '1 month'-interval '1 day')::date;

  for c in
    select * from public.classes
    where active=true and (public.is_global_admin() or public.is_venue_admin(venue_id))
  loop
    for d in select generate_series(p_month_start,month_end,interval '1 day')::date
    loop
      if extract(dow from d)::integer=c.weekday then
        for s in select * from public.class_staffing_slots where class_id=c.id order by slot_number
        loop
          insert into public.scheduled_shifts(
            class_id,staffing_slot_id,venue_id,profile_id,original_profile_id,shift_date,
            start_time,finish_time,break_minutes,class_name,status
          ) values(
            c.id,s.id,c.venue_id,s.default_profile_id,s.default_profile_id,d,
            c.start_time,c.finish_time,c.break_minutes,c.name,'scheduled'
          ) on conflict(staffing_slot_id,shift_date) do nothing;
          if found then inserted_count:=inserted_count+1; end if;
        end loop;
      end if;
    end loop;
  end loop;
  return inserted_count;
end;
$$;

grant execute on function public.generate_schedule_month(date) to authenticated;

-- Confirm scheduled work into the actual timesheet. Coaches can confirm themselves; admins can confirm on behalf.
create or replace function public.confirm_scheduled_shift(p_scheduled_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.scheduled_shifts%rowtype;
  new_shift_id uuid;
  ts_status text;
begin
  select * into r from public.scheduled_shifts where id=p_scheduled_id for update;
  if r.id is null then raise exception 'Scheduled shift not found'; end if;
  if r.profile_id is null then raise exception 'Assign a coach before confirming this shift'; end if;
  if not (r.profile_id=auth.uid() or public.is_global_admin() or public.is_venue_admin(r.venue_id)) then raise exception 'Not permitted'; end if;
  if r.status='cancelled' then raise exception 'Cancelled shifts cannot be confirmed'; end if;

  select status into ts_status from public.timesheets
  where coach_id=r.profile_id and month_start=date_trunc('month',r.shift_date)::date;
  if ts_status in ('submitted','paid') then raise exception 'That coach month is locked. Reopen it before confirming this shift.'; end if;

  if r.actual_shift_id is not null then
    update public.shifts set
      coach_id=r.profile_id,shift_date=r.shift_date,start_time=r.start_time,finish_time=r.finish_time,
      break_minutes=r.break_minutes,venue_id=r.venue_id,session_location=r.class_name,
      notes=coalesce(r.notes,'Scheduled class')
    where id=r.actual_shift_id
    returning id into new_shift_id;
  else
    insert into public.shifts(coach_id,shift_date,start_time,finish_time,break_minutes,venue_id,session_location,notes)
    values(r.profile_id,r.shift_date,r.start_time,r.finish_time,r.break_minutes,r.venue_id,r.class_name,coalesce(r.notes,'Scheduled class'))
    returning id into new_shift_id;
  end if;

  update public.scheduled_shifts set status='confirmed',actual_shift_id=new_shift_id,updated_at=now() where id=r.id;
  return new_shift_id;
end;
$$;
grant execute on function public.confirm_scheduled_shift(uuid) to authenticated;

-- Reassign a scheduled class slot. If already confirmed, move/update the linked actual shift too (unless locked).
create or replace function public.reassign_scheduled_shift(p_scheduled_id uuid,p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.scheduled_shifts%rowtype;
  ts_status text;
begin
  select * into r from public.scheduled_shifts where id=p_scheduled_id for update;
  if r.id is null then raise exception 'Scheduled shift not found'; end if;
  if not (public.is_global_admin() or public.is_venue_admin(r.venue_id)) then raise exception 'Admin only'; end if;
  if p_profile_id is not null and not exists(select 1 from public.staff_venues where profile_id=p_profile_id and venue_id=r.venue_id) then
    raise exception 'That staff member is not assigned to this organisation';
  end if;

  if r.actual_shift_id is not null and p_profile_id is not null then
    select status into ts_status from public.timesheets where coach_id=r.profile_id and month_start=date_trunc('month',r.shift_date)::date;
    if ts_status in ('submitted','paid') then raise exception 'Reopen the original coach month before changing a confirmed shift'; end if;
    update public.shifts set coach_id=p_profile_id where id=r.actual_shift_id;
  end if;
  update public.scheduled_shifts set profile_id=p_profile_id,updated_at=now() where id=r.id;
end;
$$;
grant execute on function public.reassign_scheduled_shift(uuid,uuid) to authenticated;

create or replace function public.set_scheduled_shift_cancelled(p_scheduled_id uuid,p_cancelled boolean)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare r public.scheduled_shifts%rowtype;
begin
  select * into r from public.scheduled_shifts where id=p_scheduled_id for update;
  if r.id is null then raise exception 'Scheduled shift not found'; end if;
  if not (public.is_global_admin() or public.is_venue_admin(r.venue_id)) then raise exception 'Admin only'; end if;
  if r.actual_shift_id is not null then raise exception 'A confirmed shift must be corrected through the timesheet'; end if;
  update public.scheduled_shifts set status=case when p_cancelled then 'cancelled' else 'scheduled' end,updated_at=now() where id=r.id;
end;
$$;
grant execute on function public.set_scheduled_shift_cancelled(uuid,boolean) to authenticated;

commit;
