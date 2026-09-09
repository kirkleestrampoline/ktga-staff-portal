-- Forward fix after the scoped database-security release. No historical row backfill.
begin;

create function public.confirm_scheduled_actual(
  p_scheduled_id uuid, p_start_time time, p_finish_time time, p_break_minutes integer
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $fn$
declare r public.scheduled_shifts%rowtype; sid uuid; actor_club uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication required'; end if;
  select p.club_id into actor_club from public.profiles p join public.clubs c on c.id=p.club_id
    where p.id=auth.uid() and p.is_active and c.active and p.club_id=public.current_club_id()
    for share of p,c;
  if actor_club is null then raise exception using errcode='42501',message='Active account and club required'; end if;
  -- Also protects a month with no timesheet row from concurrent submission.
  lock table public.timesheets in share row exclusive mode;
  select * into r from public.scheduled_shifts where id=p_scheduled_id for update;
  if r.id is null or r.club_id is distinct from actor_club or r.profile_id is null
    or not exists(select 1 from public.profiles where id=r.profile_id and club_id=actor_club)
    or not exists(select 1 from public.venues where id=r.venue_id and club_id=actor_club)
    or not (r.profile_id=auth.uid() or public.is_club_admin(actor_club)) then
    raise exception using errcode='42501',message='Target is outside authorised club access';
  end if;
  if r.status='cancelled' then raise exception 'Cancelled shifts cannot be confirmed'; end if;
  if exists(select 1 from public.timesheets where coach_id=r.profile_id
    and month_start=date_trunc('month',r.shift_date)::date and status in ('submitted','paid')) then
    raise exception 'That month is locked';
  end if;
  if p_start_time is null or p_finish_time is null or p_finish_time=p_start_time
    or p_break_minutes is null or p_break_minutes<0
    or p_break_minutes>=(extract(epoch from (p_finish_time-p_start_time))/60+case when p_finish_time<p_start_time then 1440 else 0 end) then
    raise exception using errcode='22023',message='Enter valid actual times and break';
  end if;
  if not public.is_club_admin(actor_club) and
    (extract(epoch from (p_finish_time-p_start_time))/60+case when p_finish_time<p_start_time then 1440 else 0 end)-p_break_minutes>
    (extract(epoch from (r.finish_time-r.start_time))/60+case when r.finish_time<r.start_time then 1440 else 0 end)-coalesce(r.break_minutes,0) then
    raise exception using errcode='42501',message='Extra time requires approval';
  end if;
  -- Retain the hardened RPC's actor, tenant and linked-actual checks.
  sid:=public.confirm_scheduled_shift_adjusted(r.id,p_start_time,p_finish_time,p_break_minutes);
  -- Match the existing confirmation workflow; do not change existing payment terms.
  if r.actual_shift_id is null then
    update public.shifts set payment_type=coalesce(r.payment_type,'standard') where id=sid;
  end if;
  return sid;
end
$fn$;
alter function public.confirm_scheduled_actual(uuid,time,time,integer) owner to postgres;
revoke all on function public.confirm_scheduled_actual(uuid,time,time,integer) from public,anon,authenticated,service_role;
grant execute on function public.confirm_scheduled_actual(uuid,time,time,integer) to authenticated;

create function public.approve_extra_shift_actual(
  p_shift_id uuid, p_start_time time, p_finish_time time, p_break_minutes integer
) returns void language plpgsql security definer set search_path=pg_catalog,public as $fn$
declare r public.shifts%rowtype; actor_club uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication required'; end if;
  select p.club_id into actor_club from public.profiles p join public.clubs c on c.id=p.club_id
    where p.id=auth.uid() and p.is_active and c.active and p.club_id=public.current_club_id()
    for share of p,c;
  if actor_club is null or not public.is_club_admin(actor_club) then
    raise exception using errcode='42501',message='Active club administrator required';
  end if;
  lock table public.timesheets in share row exclusive mode;
  select * into r from public.shifts where id=p_shift_id for update;
  if r.id is null or r.club_id is distinct from actor_club
    or not exists(select 1 from public.profiles where id=r.coach_id and club_id=actor_club)
    or (r.venue_id is not null and not exists(select 1 from public.venues where id=r.venue_id and club_id=actor_club)) then
    raise exception using errcode='42501',message='Target is outside authorised club access';
  end if;
  if coalesce(r.source,'extra')<>'extra' or r.scheduled_shift_id is not null or r.approval_status is distinct from 'pending' then
    raise exception 'Pending additional shift required; reload before approving';
  end if;
  if exists(select 1 from public.timesheets where coach_id=r.coach_id
    and month_start=date_trunc('month',r.shift_date)::date and status in ('submitted','paid')) then
    raise exception 'That month is locked';
  end if;
  if p_start_time is null or p_finish_time is null or p_finish_time=p_start_time
    or p_break_minutes is null or p_break_minutes<0
    or p_break_minutes>=(extract(epoch from (p_finish_time-p_start_time))/60+case when p_finish_time<p_start_time then 1440 else 0 end) then
    raise exception using errcode='22023',message='Enter valid actual times and break';
  end if;
  update public.shifts set start_time=p_start_time,finish_time=p_finish_time,
    break_minutes=p_break_minutes,approval_status='approved' where id=r.id;
end
$fn$;
alter function public.approve_extra_shift_actual(uuid,time,time,integer) owner to postgres;
revoke all on function public.approve_extra_shift_actual(uuid,time,time,integer) from public,anon,authenticated,service_role;
grant execute on function public.approve_extra_shift_actual(uuid,time,time,integer) to authenticated;
commit;
