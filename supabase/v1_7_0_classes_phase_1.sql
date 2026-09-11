-- Forward only. Review and apply manually; never replay scheduling migrations.
-- Production baseline: supplied Classes/Master Timetable verification export.
begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Keep all DDL, snapshots and assertions in one server-side statement. A client
-- must not split the snapshot and verification into different requests/sessions.
-- This block is atomic even if a SQL editor submits top-level statements separately.
do $classes_phase1_migration$
begin

do $preflight$
begin
 if to_regprocedure('public.generate_schedule_month(date)') is null or
    md5(pg_get_functiondef('public.generate_schedule_month(date)'::regprocedure))<>'fb587e691fc64783e7117e159991c68e' then
   raise exception 'Generator differs from reviewed production export; stop and review';
 end if;
 if to_regprocedure('public.skip_excluded_scheduled_occurrence()') is null or md5(pg_get_functiondef('public.skip_excluded_scheduled_occurrence()'::regprocedure))<>'5ca75f392cae9a9811184db499105c41' then raise exception 'Profile/exclusion trigger definition drift; review production export'; end if;
 if to_regprocedure('public.apply_class_profile_to_session()') is null or md5(pg_get_functiondef('public.apply_class_profile_to_session()'::regprocedure))<>'7316c5e7d531ece15607d801d1367ba1' then raise exception 'Profile/exclusion trigger definition drift; review production export'; end if;
 if to_regprocedure('public.propagate_class_profile_to_sessions()') is null or md5(pg_get_functiondef('public.propagate_class_profile_to_sessions()'::regprocedure))<>'3da1d0e76b9602cc774c5877b2082ebd' then raise exception 'Profile/exclusion trigger definition drift; review production export'; end if;
 if to_regclass('public.schedule_occurrence_exclusions') is null or
    to_regprocedure('public.is_club_admin(uuid)') is null or
    not exists(select 1 from pg_trigger where tgrelid='public.scheduled_shifts'::regclass
      and tgname='trg_skip_excluded_scheduled_occurrence' and tgenabled='O') then
   raise exception 'Required occurrence exclusion / club configuration missing';
 end if;
 if exists(select 1 from public.classes c left join public.class_profiles p on p.id=c.class_profile_id
   where p.id is null or p.club_id<>c.club_id) then raise exception 'Recurring profile links require review'; end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='class_profiles' and column_name='publication_status') then
   raise exception 'Classes Phase 1 already installed or incompatible metadata exists';
 end if;
end
$preflight$;
-- Fail quickly if the active club is writing. Retry manually in a quiet window.
lock table public.class_profiles,public.classes,public.class_staffing_slots,
 public.scheduled_shifts,public.shifts,public.timesheets,public.invoices,
 public.schedule_occurrence_exclusions,public.venues in share row exclusive mode;
create temporary table pg_temp.classes_phase1_scheduled_baseline on commit drop as select * from public.scheduled_shifts;
create temporary table pg_temp.classes_phase1_baseline(table_name text primary key, row_count bigint, fingerprint text) on commit drop;
-- Resolve only this session's temp schema; never accept a public lookalike.
do $baseline_preflight$
begin
 if to_regclass('pg_temp.classes_phase1_scheduled_baseline') is null
 or to_regclass('pg_temp.classes_phase1_baseline') is null then
  raise exception 'Temporary baseline creation failed; aborting Classes migration';
 end if;
 if (select count(*) from pg_temp.classes_phase1_scheduled_baseline)
    <> (select count(*) from public.scheduled_shifts) then
  raise exception 'Scheduled baseline snapshot is incomplete; aborting Classes migration';
 end if;
end
$baseline_preflight$;
do $snapshot$
declare t text; n bigint; h text;
begin
 foreach t in array array['class_profiles','classes','class_staffing_slots','scheduled_shifts','shifts','timesheets','invoices','schedule_occurrence_exclusions','venues'] loop
  execute format('select count(*),md5(coalesce(string_agg(to_jsonb(x)::text,'''' order by id),'''')) from public.%I x',t) into n,h;
  insert into pg_temp.classes_phase1_baseline values(t,n,h);
 end loop;
end
$snapshot$;

create table public.class_categories(
 id uuid primary key default gen_random_uuid(), club_id uuid not null default public.current_club_id() references public.clubs(id) on delete restrict,
 name text not null check(btrim(name)<>''), colour text not null default '#6D3A91' check(colour ~ '^#[0-9A-Fa-f]{6}$'),
 display_order integer not null default 0, active boolean not null default true,
 unique(id,club_id)
);
create unique index class_categories_name_idx on public.class_categories(club_id,lower(btrim(name)));
create table public.class_programmes(
 id uuid primary key default gen_random_uuid(), club_id uuid not null default public.current_club_id() references public.clubs(id) on delete restrict,
 name text not null check(btrim(name)<>''), category_id uuid,
 colour text not null default '#6D3A91' check(colour ~ '^#[0-9A-Fa-f]{6}$'), description text,
 active boolean not null default true, unique(id,club_id),
 foreign key(category_id,club_id) references public.class_categories(id,club_id) on delete restrict
);
create unique index class_programmes_name_idx on public.class_programmes(club_id,lower(btrim(name)));
-- Constant metadata defaults backfill without UPDATE or firing profile propagation.
alter table public.class_profiles
 add column publication_status text not null default 'published' check(publication_status in ('draft','published')),
 add column visibility text not null default 'internal' check(visibility in ('internal','public')),
 add column category_id uuid,
 add column programme_id uuid,
 add column start_date date,
 add column end_date date,
 add column eligibility_description text,
 add column description text,
 add column published_at timestamptz,
 add column published_by uuid references public.profiles(id) on delete restrict,
 add constraint class_profile_category_club_fk foreign key(category_id,club_id) references public.class_categories(id,club_id) on delete restrict,
 add constraint class_profile_programme_club_fk foreign key(programme_id,club_id) references public.class_programmes(id,club_id) on delete restrict,
 add constraint class_profile_dates_valid check(end_date is null or (start_date is not null and end_date>=start_date));
alter table public.class_profiles alter column publication_status set default 'draft';
alter table public.class_staffing_slots add column active boolean not null default true;
create table public.class_activity(
 id uuid primary key default gen_random_uuid(), club_id uuid not null default public.current_club_id() references public.clubs(id) on delete restrict,
 class_profile_id uuid not null references public.class_profiles(id) on delete restrict,
 action text not null, actor_id uuid default auth.uid() references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);

alter table public.class_categories enable row level security;
alter table public.class_programmes enable row level security;
alter table public.class_activity enable row level security;
create policy categories_read on public.class_categories for select to authenticated using(club_id=public.current_club_id() and public.is_club_admin(club_id));
create policy programmes_read on public.class_programmes for select to authenticated using(club_id=public.current_club_id() and public.is_club_admin(club_id));
create policy activity_read on public.class_activity for select to authenticated using(club_id=public.current_club_id() and public.is_club_admin(club_id));
revoke all on public.class_categories,public.class_programmes,public.class_activity from public,anon,authenticated;
grant select on public.class_categories,public.class_programmes,public.class_activity to authenticated;

-- Keep metadata-only saves from touching recurrence updated_at or shared fields.
-- The existing propagation function and its ordinary Master TT behaviour stay intact.
drop trigger propagate_class_profile_to_sessions on public.class_profiles;
create trigger propagate_class_profile_to_sessions after update on public.class_profiles
 for each row when (
 (old.name,old.programme,old.session_colour,old.capacity,old.minimum_age,old.maximum_age,
 old.session_length_minutes,old.lead_coaches_required,old.assistant_coaches_required,
 old.minimum_coaches,old.maximum_coaches,old.lead_recommended_qualification_id,
 old.assistant_recommended_qualification_id,old.warn_if_understaffed,old.critical_if_no_lead,
 old.allow_below_recommended_qualification)
 is distinct from
 (new.name,new.programme,new.session_colour,new.capacity,new.minimum_age,new.maximum_age,
 new.session_length_minutes,new.lead_coaches_required,new.assistant_coaches_required,
 new.minimum_coaches,new.maximum_coaches,new.lead_recommended_qualification_id,
 new.assistant_recommended_qualification_id,new.warn_if_understaffed,new.critical_if_no_lead,
 new.allow_below_recommended_qualification))
 execute function public.propagate_class_profile_to_sessions();

-- All insertion paths (including legacy copy RPCs) respect draft/inactive slots.
-- Existing assignments are never updated/deleted by this trigger.
create function public.classes_phase1_shift_gate() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.class_id is not null and exists(select 1 from public.classes c join public.class_profiles p on p.id=c.class_profile_id
   where c.id=new.class_id and (p.publication_status<>'published' or
   (p.start_date is not null and new.shift_date<p.start_date) or (p.end_date is not null and new.shift_date>p.end_date))) then return null; end if;
 if new.staffing_slot_id is not null and exists(select 1 from public.class_staffing_slots where id=new.staffing_slot_id and not active) then return null; end if;
 return new;
end $$;
create trigger classes_phase1_shift_gate before insert on public.scheduled_shifts for each row execute function public.classes_phase1_shift_gate();
create function public.classes_preserve_slot() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if exists(select 1 from public.scheduled_shifts where staffing_slot_id=old.id)
 or exists(select 1 from public.schedule_occurrence_exclusions where staffing_slot_id=old.id) then
  raise exception 'This slot has schedule history. Deactivate it instead of deleting it.';
 end if;
 return old;
end $$;
create trigger classes_preserve_slot before delete on public.class_staffing_slots for each row execute function public.classes_preserve_slot();

create function public.classes_save_taxonomy(p_kind text,p_data jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare cid uuid:=public.current_club_id(); rid uuid:=nullif(p_data->>'id','')::uuid; cat uuid:=nullif(p_data->>'category_id','')::uuid;
begin
 if cid is null or not public.is_club_admin(cid) then raise exception 'Club administrator only'; end if;
 if p_kind not in ('category','programme') then raise exception 'Invalid taxonomy kind'; end if;
 if cat is not null and not exists(select 1 from public.class_categories where id=cat and club_id=cid) then raise exception 'Category outside club'; end if;
 if rid is null then
  if p_kind='category' then
   insert into public.class_categories(club_id,name,colour,display_order,active) values(cid,btrim(p_data->>'name'),p_data->>'colour',coalesce((p_data->>'display_order')::int,0),coalesce((p_data->>'active')::boolean,true)) returning id into rid;
  else
   insert into public.class_programmes(club_id,name,colour,category_id,description,active) values(cid,btrim(p_data->>'name'),p_data->>'colour',cat,p_data->>'description',coalesce((p_data->>'active')::boolean,true)) returning id into rid;
  end if;
 else
  if p_kind='category' then
   update public.class_categories set name=btrim(p_data->>'name'),colour=p_data->>'colour',display_order=coalesce((p_data->>'display_order')::int,0),active=coalesce((p_data->>'active')::boolean,true) where id=rid and club_id=cid;
  else
   update public.class_programmes set name=btrim(p_data->>'name'),colour=p_data->>'colour',category_id=cat,description=p_data->>'description',active=coalesce((p_data->>'active')::boolean,true) where id=rid and club_id=cid;
  end if;
  if not found then raise exception 'Taxonomy record outside club'; end if;
 end if;
 return rid;
end $$;

create function public.classes_save_profile(p_data jsonb,p_sessions jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare cid uuid:=public.current_club_id(); rid uuid:=nullif(p_data->>'id','')::uuid; p public.class_profiles%rowtype;
 s jsonb; sid uuid; keep_ids uuid[]:='{}'; req int:=(p_data->>'required_coaches')::int; duration int:=(p_data->>'session_length_minutes')::int;
 cat uuid:=nullif(p_data->>'category_id','')::uuid; prog uuid:=nullif(p_data->>'programme_id','')::uuid;
begin
 if cid is null or not public.is_club_admin(cid) then raise exception 'Club administrator only'; end if;
 if req is null or req<1 or req>12 then raise exception 'Required coaches must be 1–12'; end if;
 if cat is not null and not exists(select 1 from public.class_categories where id=cat and club_id=cid) then raise exception 'Category outside club'; end if;
 if prog is not null and not exists(select 1 from public.class_programmes where id=prog and club_id=cid and (category_id is null or category_id is not distinct from cat)) then raise exception 'Programme/category mismatch'; end if;
 if rid is not null then
  select * into p from public.class_profiles where id=rid and club_id=cid for update;
  if not found then raise exception 'Class outside club'; end if;
  if p.publication_status='published' and exists(select 1 from public.classes where class_profile_id=p.id and finish_time is distinct from (start_time+make_interval(mins=>p.session_length_minutes))::time) then raise exception 'Recurring durations need Master Timetable review before editing shared class details'; end if;
  if p.publication_status='published' and p_sessions is not null then raise exception 'Published schedule is managed in Master Timetable'; end if;
  if p.publication_status='published' and (duration<>p.session_length_minutes or
   nullif(p_data->>'start_date','')::date is distinct from p.start_date or nullif(p_data->>'end_date','')::date is distinct from p.end_date) then
   raise exception 'Published timing and date changes require an effective-date workflow';
  end if;
 else
  insert into public.class_profiles(club_id,name,capacity,session_length_minutes,publication_status,visibility)
   values(cid,btrim(p_data->>'name'),(p_data->>'capacity')::int,duration,'draft','internal') returning * into p;
  rid:=p.id;
 end if;
 update public.class_profiles set name=btrim(p_data->>'name'),capacity=(p_data->>'capacity')::int,
  minimum_age=nullif(p_data->>'minimum_age','')::int,maximum_age=nullif(p_data->>'maximum_age','')::int,
  category_id=cat,programme_id=prog,visibility=p_data->>'visibility',
  start_date=nullif(p_data->>'start_date','')::date,end_date=nullif(p_data->>'end_date','')::date,
  description=p_data->>'description',eligibility_description=p_data->>'eligibility_description',
  session_length_minutes=duration,
  lead_coaches_required=least(p.lead_coaches_required,req),assistant_coaches_required=req-least(p.lead_coaches_required,req),
  minimum_coaches=least(p.minimum_coaches,req),maximum_coaches=greatest(p.maximum_coaches,req),updated_at=now()
 where id=rid;
 if p.publication_status='draft' then
  if p_sessions is null or jsonb_typeof(p_sessions)<>'array' or jsonb_array_length(p_sessions)<1 then raise exception 'Add at least one recurring session'; end if;
  if exists(select 1 from jsonb_array_elements(p_sessions) v group by v->>'weekday',v->>'start_time' having count(*)>1) then raise exception 'Recurring day and time must be unique'; end if;
  for s in select value from jsonb_array_elements(p_sessions) loop
   if s->>'start_time' is null or s->>'weekday' is null or coalesce((s->>'break_minutes')::int,0)<0 or coalesce((s->>'break_minutes')::int,0)>=duration then raise exception 'Valid start, weekday and break shorter than duration required'; end if;
   if not exists(select 1 from public.venues where id=(s->>'venue_id')::uuid and club_id=cid and active) then raise exception 'Select an active venue in this club'; end if;
   sid:=nullif(s->>'id','')::uuid;
   if sid is null then
    insert into public.classes(class_profile_id,venue_id,weekday,start_time,break_minutes)
     values(rid,(s->>'venue_id')::uuid,(s->>'weekday')::int,(s->>'start_time')::time,coalesce((s->>'break_minutes')::int,0)) returning id into sid;
   else
    update public.classes set venue_id=(s->>'venue_id')::uuid,weekday=(s->>'weekday')::int,start_time=(s->>'start_time')::time,
     break_minutes=coalesce((s->>'break_minutes')::int,0) where id=sid and class_profile_id=rid;
    if not found then raise exception 'Session outside class'; end if;
   end if;
   keep_ids:=array_append(keep_ids,sid);
  end loop;
  -- Draft recurrences are retired, never deleted. They have no generated staffing.
  update public.classes set active=false where class_profile_id=rid and not(id=any(keep_ids)) and active;
 end if;
 for sid in select id from public.classes where class_profile_id=rid and active loop
  insert into public.class_staffing_slots(class_id,slot_number,active)
   select sid,n,true from generate_series(1,req) n
   on conflict(class_id,slot_number) do update set active=true;
  update public.class_staffing_slots set active=false where class_id=sid and slot_number>req and active;
 end loop;
 insert into public.class_activity(club_id,class_profile_id,action) values(cid,rid,case when p_data->>'id' is null then 'Draft created' else 'Class details saved' end);
 return rid;
end $$;

create function public.classes_publish(p_profile_id uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.class_profiles%rowtype;
begin
 select * into p from public.class_profiles where id=p_profile_id and club_id=public.current_club_id() for update;
 if not found or not public.is_club_admin(p.club_id) then raise exception 'Club administrator only'; end if;
 if p.publication_status='published' then return; end if;
 if not p.active or p.start_date is null or p.capacity<1 or not exists(select 1 from public.classes where class_profile_id=p.id and active) then raise exception 'Active class, start date, capacity and recurrence required'; end if;
 if exists(select 1 from public.classes c where c.class_profile_id=p.id and c.active and
  (not exists(select 1 from public.venues v where v.id=c.venue_id and v.club_id=p.club_id and v.active) or
   not exists(select 1 from public.class_staffing_slots s where s.class_id=c.id and s.active))) then raise exception 'Every session needs an active venue and staffing requirements'; end if;
 update public.class_profiles set publication_status='published',published_at=now(),published_by=auth.uid() where id=p.id;
 insert into public.class_activity(club_id,class_profile_id,action) values(p.club_id,p.id,'Published to Master Timetable');
end $$;

-- Read only RPC: excludes staff identities and financial fields. Calendar opening
-- performs no generation. Raw slot exclusions preserve whole/partial distinctions.
create function public.classes_calendar_data(p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare cid uuid:=public.current_club_id(); result jsonb;
begin
 if cid is null or not public.is_club_admin(cid) then raise exception 'Club administrator only'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>42 then raise exception 'Calendar range must be at most 43 days'; end if;
 select jsonb_build_object(
 'profiles',coalesce((select jsonb_agg(to_jsonb(p)) from public.class_profiles p where club_id=cid),'[]'),
 'sessions',coalesce((select jsonb_agg(to_jsonb(c)) from public.classes c where club_id=cid),'[]'),
 'categories',coalesce((select jsonb_agg(to_jsonb(c) order by display_order,name) from public.class_categories c where club_id=cid),'[]'),
 'programmes',coalesce((select jsonb_agg(to_jsonb(p) order by name) from public.class_programmes p where club_id=cid),'[]'),
 'venues',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active)) from public.venues where club_id=cid),'[]'),
 'slots',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'class_id',s.class_id,'slot_number',s.slot_number,'active',s.active,'coach_name',p.full_name)) from public.class_staffing_slots s join public.classes c on c.id=s.class_id left join public.profiles p on p.id=s.default_profile_id where c.club_id=cid),'[]'),
 'shifts',coalesce((select jsonb_agg(jsonb_build_object('class_id',class_id,'staffing_slot_id',staffing_slot_id,'shift_date',shift_date,'status',status,'assigned',profile_id is not null,'start_time',start_time,'finish_time',finish_time,'venue_id',venue_id)) from public.scheduled_shifts where club_id=cid and shift_date between p_from and p_to),'[]'),
 'exclusions',coalesce((select jsonb_agg(jsonb_build_object('class_id',e.class_id,'staffing_slot_id',e.staffing_slot_id,'shift_date',e.shift_date)) from public.schedule_occurrence_exclusions e join public.classes c on c.id=e.class_id where c.club_id=cid and e.shift_date between p_from and p_to),'[]'),
 'activity',coalesce((select jsonb_agg(x) from (select class_profile_id,action,created_at from public.class_activity where club_id=cid order by created_at desc limit 200) x),'[]')
 ) into result;
 return result;
end $$;

-- New user RPCs only; existing mutation ACL cleanup is a separate reviewed task.
revoke all on function public.classes_phase1_shift_gate(),public.classes_preserve_slot() from public,anon,authenticated,service_role;
revoke all on function public.classes_save_taxonomy(text,jsonb),public.classes_save_profile(jsonb,jsonb),public.classes_publish(uuid),public.classes_calendar_data(date,date) from public,anon,authenticated;
grant execute on function public.classes_save_taxonomy(text,jsonb),public.classes_save_profile(jsonb,jsonb),public.classes_publish(uuid),public.classes_calendar_data(date,date) to authenticated;

-- Reviewed generator: only publication/date/active-slot predicates added.
CREATE OR REPLACE FUNCTION public.generate_schedule_month(p_month_start date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  actor_club uuid := public.current_club_id();
  d date;
  month_end date;
  c record;
  s record;
  inserted_count integer := 0;
begin
  if actor_club is null or not public.is_club_admin(actor_club) then
    raise exception using errcode = '42501', message = 'Club administrator only';
  end if;

  p_month_start := date_trunc('month', p_month_start)::date;
  month_end := (p_month_start + interval '1 month - 1 day')::date;

  for c in
    select classes.*
    from public.classes
    join public.venues v on v.id = classes.venue_id
    where classes.active = true
      and v.club_id = actor_club
      and exists (select 1 from public.class_profiles p where p.id=classes.class_profile_id and p.publication_status='published')
  loop
    for d in
      select generate_series(
        p_month_start,
        month_end,
        interval '1 day'
      )::date
    loop
      if extract(dow from d)::integer = c.weekday and exists (select 1 from public.class_profiles p where p.id=c.class_profile_id and (p.start_date is null or d>=p.start_date) and (p.end_date is null or d<=p.end_date)) then
        for s in
          select *
          from public.class_staffing_slots
          where class_id = c.id and active
          order by slot_number
        loop
          insert into public.scheduled_shifts(
            club_id,
            class_id,
            staffing_slot_id,
            venue_id,
            profile_id,
            original_profile_id,
            shift_date,
            start_time,
            finish_time,
            break_minutes,
            class_name,
            status
          )
          values (
            actor_club,
            c.id,
            s.id,
            c.venue_id,
            s.default_profile_id,
            s.default_profile_id,
            d,
            c.start_time,
            c.finish_time,
            c.break_minutes,
            c.name,
            'scheduled'
          )
          on conflict (staffing_slot_id, shift_date) do nothing;

          if found then
            inserted_count := inserted_count + 1;
          end if;
        end loop;
      end if;
    end loop;
  end loop;

  return inserted_count;
end
$function$
;

-- Scoped ACL-only hardening; no existing function bodies changed beyond generation.
revoke execute on function public.generate_schedule_month(p_month_start date) from public,anon;
grant execute on function public.generate_schedule_month(p_month_start date) to authenticated;
revoke execute on function public.confirm_scheduled_shift(p_scheduled_id uuid) from public,anon;
grant execute on function public.confirm_scheduled_shift(p_scheduled_id uuid) to authenticated;
revoke execute on function public.reassign_scheduled_shift(p_scheduled_id uuid, p_profile_id uuid) from public,anon;
grant execute on function public.reassign_scheduled_shift(p_scheduled_id uuid, p_profile_id uuid) to authenticated;
revoke execute on function public.set_scheduled_shift_cancelled(p_scheduled_id uuid, p_cancelled boolean) from public,anon;
grant execute on function public.set_scheduled_shift_cancelled(p_scheduled_id uuid, p_cancelled boolean) to authenticated;
revoke execute on function public.unconfirm_scheduled_shift(p_scheduled_id uuid) from public,anon;
grant execute on function public.unconfirm_scheduled_shift(p_scheduled_id uuid) to authenticated;
revoke execute on function public.clone_schedule_month(p_source_month date, p_target_month date) from public,anon;
grant execute on function public.clone_schedule_month(p_source_month date, p_target_month date) to authenticated;
revoke execute on function public.copy_schedule_week(p_source_monday date, p_target_monday date) from public,anon;
grant execute on function public.copy_schedule_week(p_source_monday date, p_target_monday date) to authenticated;
revoke execute on function public.swap_scheduled_assignments(p_source_id uuid, p_target_id uuid) from public,anon;
grant execute on function public.swap_scheduled_assignments(p_source_id uuid, p_target_id uuid) to authenticated;
revoke execute on function public.sync_class_schedule(p_class_id uuid) from public,anon;
grant execute on function public.sync_class_schedule(p_class_id uuid) to authenticated;
revoke execute on function public.confirm_scheduled_shift_adjusted(p_scheduled_id uuid, p_start_time time without time zone, p_finish_time time without time zone, p_break_minutes integer) from public,anon;
grant execute on function public.confirm_scheduled_shift_adjusted(p_scheduled_id uuid, p_start_time time without time zone, p_finish_time time without time zone, p_break_minutes integer) to authenticated;
revoke execute on function public.request_scheduled_overtime(p_scheduled_id uuid, p_start_time time without time zone, p_finish_time time without time zone, p_break_minutes integer, p_reason text) from public,anon;
grant execute on function public.request_scheduled_overtime(p_scheduled_id uuid, p_start_time time without time zone, p_finish_time time without time zone, p_break_minutes integer, p_reason text) to authenticated;
revoke execute on function public.cancel_scheduled_adjustment(p_scheduled_id uuid) from public,anon;
grant execute on function public.cancel_scheduled_adjustment(p_scheduled_id uuid) to authenticated;
revoke execute on function public.approve_scheduled_adjustment(p_scheduled_id uuid) from public,anon;
grant execute on function public.approve_scheduled_adjustment(p_scheduled_id uuid) to authenticated;
revoke execute on function public.undo_own_scheduled_confirmation(p_scheduled_id uuid) from public,anon;
grant execute on function public.undo_own_scheduled_confirmation(p_scheduled_id uuid) to authenticated;
revoke execute on function public.skip_excluded_scheduled_occurrence() from public,anon;
revoke execute on function public.skip_excluded_scheduled_occurrence() from authenticated,service_role;
revoke execute on function public.remove_scheduled_occurrence(p_scheduled_id uuid) from public,anon;
grant execute on function public.remove_scheduled_occurrence(p_scheduled_id uuid) to authenticated;
revoke execute on function public.clear_schedule_month(p_month_start date) from public,anon;
grant execute on function public.clear_schedule_month(p_month_start date) to authenticated;
revoke execute on function public.get_removed_schedule_occurrences(p_month_start date) from public,anon;
grant execute on function public.get_removed_schedule_occurrences(p_month_start date) to authenticated;
revoke execute on function public.restore_schedule_occurrence(p_class_id uuid, p_shift_date date) from public,anon;
grant execute on function public.restore_schedule_occurrence(p_class_id uuid, p_shift_date date) to authenticated;
revoke execute on function public.record_coaching_assignment() from public,anon;
revoke execute on function public.record_coaching_assignment() from authenticated,service_role;
revoke execute on function public.apply_class_profile_to_session() from public,anon;
revoke execute on function public.apply_class_profile_to_session() from authenticated,service_role;
revoke execute on function public.propagate_class_profile_to_sessions() from public,anon;
revoke execute on function public.propagate_class_profile_to_sessions() from authenticated,service_role;
revoke execute on function public.set_class_profile_active(p_profile_id uuid, p_active boolean) from public,anon;
grant execute on function public.set_class_profile_active(p_profile_id uuid, p_active boolean) to authenticated;
revoke execute on function public.delete_class_profile_if_unused(p_profile_id uuid) from public,anon;
grant execute on function public.delete_class_profile_if_unused(p_profile_id uuid) to authenticated;
revoke execute on function public.confirm_scheduled_actual(p_scheduled_id uuid, p_start_time time without time zone, p_finish_time time without time zone, p_break_minutes integer) from public,anon;
grant execute on function public.confirm_scheduled_actual(p_scheduled_id uuid, p_start_time time without time zone, p_finish_time time without time zone, p_break_minutes integer) to authenticated;

do $verify$
declare b record; n bigint; h text; expr text;
begin
 -- Fail closed before querying either temporary table. Never recreate a missing
 -- baseline here: doing so would compare modified data against itself.
 if to_regclass('pg_temp.classes_phase1_scheduled_baseline') is null
 or to_regclass('pg_temp.classes_phase1_baseline') is null then
  raise exception 'Temporary baseline missing before verification; rolling back. Run the complete migration in one session.';
 end if;
 if (select count(*) from pg_temp.classes_phase1_baseline)<>9
 or exists(select 1 from unnest(array['class_profiles','classes','class_staffing_slots','scheduled_shifts','shifts','timesheets','invoices','schedule_occurrence_exclusions','venues']) expected(name)
   where not exists(select 1 from pg_temp.classes_phase1_baseline entry where entry.table_name=expected.name and entry.row_count is not null and entry.fingerprint is not null)) then
  raise exception 'Operational baseline incomplete before verification; rolling back';
 end if;
 if (select count(*) from pg_temp.classes_phase1_scheduled_baseline)
    <> (select row_count from pg_temp.classes_phase1_baseline where table_name='scheduled_shifts') then
  raise exception 'Scheduled baseline count changed before verification; rolling back';
 end if;
 if exists((select * from public.scheduled_shifts except select * from pg_temp.classes_phase1_scheduled_baseline) union all (select * from pg_temp.classes_phase1_scheduled_baseline except select * from public.scheduled_shifts)) then raise exception 'Existing scheduled-shift values changed; rolling back'; end if;
 for b in select * from pg_temp.classes_phase1_baseline loop
  expr:='to_jsonb(x)';
  if b.table_name='class_profiles' then expr:=expr||' - array[''publication_status'',''visibility'',''category_id'',''programme_id'',''start_date'',''end_date'',''eligibility_description'',''description'',''published_at'',''published_by'']'; end if;
  if b.table_name='class_staffing_slots' then expr:=expr||' - ''active'''; end if;
  execute format('select count(*),md5(coalesce(string_agg((%s)::text,'''' order by id),'''')) from public.%I x',expr,b.table_name) into n,h;
  if n<>b.row_count or h<>b.fingerprint then raise exception 'Operational data changed in %; rolling back',b.table_name; end if;
 end loop;
 if exists(select 1 from public.class_profiles where publication_status<>'published' or visibility<>'internal') then raise exception 'Existing metadata defaults incorrect'; end if;
 if exists(select 1 from public.class_staffing_slots where not active) then raise exception 'Existing slot activity changed'; end if;
end
$verify$;
end
$classes_phase1_migration$;
commit;
