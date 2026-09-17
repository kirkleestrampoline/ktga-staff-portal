-- PREPARED, NOT RUN. Forward-only internal enrolments foundation.
-- Adds no billing, attendance, communications, portal or scheduled-shift behaviour.
begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

do $enrolments_migration$
declare baseline record;t text;n bigint;h text;
begin
 if to_regclass('public.enrolments') is not null then raise exception 'Enrolments foundation is already installed or conflicts with an existing table'; end if;
 if to_regprocedure('public.member_management_club()') is null or
    (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.member_management_club()'))<>'32a6d679d0123a0543c10c918884092a' then
   raise exception 'Member management authority differs from the reviewed schema';
 end if;
 if to_regprocedure('public.classes_command(text,uuid,jsonb,uuid)') is null or
    (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.classes_command(text,uuid,jsonb,uuid)'))<>'5f18892209c305a462f0bbf28884228a' then
   raise exception 'Classes lifecycle command differs from the reviewed schema';
 end if;
 if exists(select 1 from unnest(array['member_families','member_athletes','class_profiles','classes','venues','scheduled_shifts','shifts','timesheets','invoices']) name where to_regclass('public.'||name) is null) then
   raise exception 'Required Members, Classes or preservation tables are missing';
 end if;

 lock table public.member_families,public.member_athletes,public.class_profiles,public.classes,public.venues,
  public.scheduled_shifts,public.shifts,public.timesheets,public.invoices in share row exclusive mode;
 create temporary table pg_temp.enrolments_baseline(table_name text primary key,n bigint,h text) on commit drop;
 foreach t in array array['member_families','member_athletes','class_profiles','classes','venues','scheduled_shifts','shifts','timesheets','invoices'] loop
  execute format('select count(*),md5(coalesce(string_agg(to_jsonb(x)::text,'''' order by id),'''')) from public.%I x',t) into n,h;
  insert into pg_temp.enrolments_baseline values(t,n,h);
 end loop;

 create unique index member_athletes_club_family_id_unique on public.member_athletes(club_id,family_id,id);
 create unique index class_profiles_club_id_unique on public.class_profiles(club_id,id);
 create unique index classes_club_profile_id_unique on public.classes(club_id,class_profile_id,id);

 create table public.enrolments(
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  family_id uuid not null,
  athlete_id uuid not null,
  class_profile_id uuid not null,
  status text not null check(status in ('enquiry','trial','waiting','active','paused','ended')),
  start_date date not null,
  end_date date,
  source text not null default '' check(length(source)<=120),
  internal_notes text not null default '' check(length(internal_notes)<=4000),
  created_at timestamptz not null default now(),created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id) on delete set null,
  constraint enrolments_dates_valid check(end_date is null or end_date>=start_date),
  constraint enrolments_family_fk foreign key(club_id,family_id) references public.member_families(club_id,id) on delete restrict,
  constraint enrolments_athlete_family_fk foreign key(club_id,family_id,athlete_id) references public.member_athletes(club_id,family_id,id) on delete restrict,
  constraint enrolments_profile_fk foreign key(club_id,class_profile_id) references public.class_profiles(club_id,id) on delete restrict,
  unique(club_id,id),unique(club_id,class_profile_id,id)
 );
 create index enrolments_profile_status_idx on public.enrolments(club_id,class_profile_id,status,start_date,end_date);
 create index enrolments_athlete_idx on public.enrolments(club_id,athlete_id,start_date,end_date);

 create table public.enrolment_session_selections(
  id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete restrict,
  enrolment_id uuid not null,class_profile_id uuid not null,class_id uuid not null,
  selected_from date not null,selected_to date,superseded_at timestamptz,
  created_at timestamptz not null default now(),created_by uuid references public.profiles(id) on delete set null,
  constraint enrolment_session_dates_valid check(selected_to is null or selected_to>=selected_from),
  constraint enrolment_session_parent_fk foreign key(club_id,class_profile_id,enrolment_id) references public.enrolments(club_id,class_profile_id,id) on delete restrict,
  constraint enrolment_session_class_fk foreign key(club_id,class_profile_id,class_id) references public.classes(club_id,class_profile_id,id) on delete restrict,
  unique(club_id,id)
 );
 create index enrolment_sessions_enrolment_idx on public.enrolment_session_selections(club_id,enrolment_id,selected_from,selected_to);
 create index enrolment_sessions_class_idx on public.enrolment_session_selections(club_id,class_id,selected_from,selected_to) where superseded_at is null;

 create table public.enrolment_status_history(
  id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete restrict,
  enrolment_id uuid not null,from_status text check(from_status is null or from_status in ('enquiry','trial','waiting','active','paused','ended')),
  to_status text not null check(to_status in ('enquiry','trial','waiting','active','paused','ended')),
  effective_date date not null,reason text not null check(length(btrim(reason)) between 1 and 500),
  actor_id uuid references public.profiles(id) on delete set null,created_at timestamptz not null default now(),
  foreign key(club_id,enrolment_id) references public.enrolments(club_id,id) on delete restrict
 );
 create index enrolment_history_idx on public.enrolment_status_history(club_id,enrolment_id,created_at,id);

 create table public.enrolment_command_log(
  id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete restrict,
  enrolment_id uuid not null,actor_id uuid references public.profiles(id) on delete set null,
  action text not null,request_id uuid not null,payload_hash text not null,result jsonb not null,details jsonb not null default '{}',created_at timestamptz not null default now(),
  foreign key(club_id,enrolment_id) references public.enrolments(club_id,id) on delete restrict,
  unique(club_id,request_id)
 );

 create function public.enrolment_row_guard() returns trigger language plpgsql set search_path=pg_catalog,public as $fn$
 begin
  if tg_op='DELETE' then raise exception using errcode='23503',message='Enrolments are historical records. End them instead of deleting them.'; end if;
  if (new.id,new.club_id,new.family_id,new.athlete_id,new.class_profile_id,new.created_at) is distinct from (old.id,old.club_id,old.family_id,old.athlete_id,old.class_profile_id,old.created_at) then raise exception using errcode='23514',message='Enrolment identity and ownership cannot change'; end if;
  new.updated_at:=now();new.updated_by:=auth.uid();return new;
 end $fn$;
 create trigger enrolment_row_guard before update or delete on public.enrolments for each row execute function public.enrolment_row_guard();

 create function public.enrolment_selection_guard() returns trigger language plpgsql set search_path=pg_catalog,public as $fn$
 begin
  if tg_op='DELETE' then raise exception using errcode='23503',message='Enrolment session history cannot be deleted'; end if;
  if (new.id,new.club_id,new.enrolment_id,new.class_profile_id,new.class_id,new.selected_from,new.created_at,new.created_by) is distinct from (old.id,old.club_id,old.enrolment_id,old.class_profile_id,old.class_id,old.selected_from,old.created_at,old.created_by) then raise exception using errcode='23514',message='Historical session identity cannot change'; end if;
  return new;
 end $fn$;
 create trigger enrolment_selection_guard before update or delete on public.enrolment_session_selections for each row execute function public.enrolment_selection_guard();

 create function public.enrolment_append_only() returns trigger language plpgsql set search_path=pg_catalog,public as $fn$
 begin raise exception using errcode='23503',message='Enrolment audit history is append only'; end $fn$;
 create trigger enrolment_history_append_only before update or delete on public.enrolment_status_history for each row execute function public.enrolment_append_only();
 create trigger enrolment_commands_append_only before update or delete on public.enrolment_command_log for each row execute function public.enrolment_append_only();

 alter table public.enrolments enable row level security;alter table public.enrolments force row level security;
 alter table public.enrolment_session_selections enable row level security;alter table public.enrolment_session_selections force row level security;
 alter table public.enrolment_status_history enable row level security;alter table public.enrolment_status_history force row level security;
 alter table public.enrolment_command_log enable row level security;alter table public.enrolment_command_log force row level security;
 create policy enrolments_read on public.enrolments for select to authenticated using(public.can_read_member_data(club_id));
 create policy enrolment_sessions_read on public.enrolment_session_selections for select to authenticated using(public.can_read_member_data(club_id));
 create policy enrolment_history_read on public.enrolment_status_history for select to authenticated using(public.can_read_member_data(club_id));
 create policy enrolment_commands_read on public.enrolment_command_log for select to authenticated using(public.can_read_member_data(club_id));
 revoke all on public.enrolments,public.enrolment_session_selections,public.enrolment_status_history,public.enrolment_command_log from public,anon,authenticated,service_role;

 create function public.enrolments_validate(p_enrolment_id uuid,p_override_reason text default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $fn$
 declare e public.enrolments%rowtype; issue record; issues jsonb:='[]'; actor_today date:=(now() at time zone 'Europe/London')::date;
 begin
  select * into e from public.enrolments where id=p_enrolment_id for update;
  if not found then raise exception using errcode='42501',message='Enrolment unavailable'; end if;
  if not exists(select 1 from public.enrolment_session_selections s where s.enrolment_id=e.id and s.club_id=e.club_id and s.superseded_at is null) then raise exception using errcode='23514',message='Select at least one weekly session'; end if;
  if e.status in ('active','trial','waiting') and not exists(select 1 from public.enrolment_session_selections s join public.classes c on c.id=s.class_id and c.club_id=s.club_id where s.enrolment_id=e.id and s.club_id=e.club_id and s.superseded_at is null and c.active and coalesce(s.selected_to,'infinity'::date)>=greatest(e.start_date,actor_today)) then raise exception using errcode='23514',message='This status requires a current or future active weekly session'; end if;
  if e.status in ('active','trial','waiting') and exists(
   select 1 from public.enrolments other
   join public.enrolment_session_selections os on os.enrolment_id=other.id and os.club_id=other.club_id and os.superseded_at is null
   join public.enrolment_session_selections own on own.enrolment_id=e.id and own.club_id=e.club_id and own.superseded_at is null and own.class_id=os.class_id
   where other.id<>e.id and other.club_id=e.club_id and other.athlete_id=e.athlete_id and other.class_profile_id=e.class_profile_id and other.status in ('active','trial','waiting')
    and daterange(own.selected_from,coalesce(own.selected_to,'infinity'::date),'[]') && daterange(os.selected_from,coalesce(os.selected_to,'infinity'::date),'[]')
  ) then raise exception using errcode='23505',message='This athlete already has an overlapping active, trial or waiting enrolment for a selected session'; end if;
  if e.status in ('active','trial') then
   if not exists(select 1 from public.class_profiles p where p.id=e.class_profile_id and p.club_id=e.club_id and p.active and p.publication_status='published') then raise exception using errcode='23514',message='Active and trial enrolments require an active published class'; end if;
   for issue in
    select own.class_id,c.weekday,c.start_time,p.capacity,coalesce(max(at_point.occupied),0)::integer occupied
    from public.enrolment_session_selections own join public.classes c on c.id=own.class_id and c.club_id=own.club_id
    join public.class_profiles p on p.id=own.class_profile_id and p.club_id=own.club_id
    cross join lateral (select own.selected_from as capacity_date union select greatest(os.selected_from,own.selected_from) as capacity_date
      from public.enrolment_session_selections os join public.enrolments other on other.id=os.enrolment_id and other.club_id=os.club_id
      where os.club_id=own.club_id and os.class_id=own.class_id and os.superseded_at is null and other.id<>e.id and other.status in ('active','trial')
       and daterange(os.selected_from,coalesce(os.selected_to,'infinity'::date),'[]') && daterange(own.selected_from,coalesce(own.selected_to,'infinity'::date),'[]')) as capacity_points
    cross join lateral (select count(distinct other.id)::integer occupied
      from public.enrolments other join public.enrolment_session_selections os on os.enrolment_id=other.id and os.club_id=other.club_id and os.superseded_at is null
      where other.id<>e.id and other.club_id=e.club_id and other.status in ('active','trial') and os.class_id=own.class_id
       and capacity_points.capacity_date between os.selected_from and coalesce(os.selected_to,'infinity'::date)) as at_point
    where own.enrolment_id=e.id and own.club_id=e.club_id and own.superseded_at is null
    group by own.class_id,c.weekday,c.start_time,p.capacity
    having coalesce(max(at_point.occupied),0)>=p.capacity
   loop issues:=issues||jsonb_build_array(jsonb_build_object('class_id',issue.class_id,'weekday',issue.weekday,'start_time',issue.start_time,'capacity',issue.capacity,'occupied',issue.occupied));end loop;
   if jsonb_array_length(issues)>0 and nullif(btrim(coalesce(p_override_reason,'')),'') is null then raise exception using errcode='P0001',message='Capacity is full for one or more selected weekly sessions. Choose Waiting list or record an override reason.'; end if;
   if length(coalesce(p_override_reason,''))>500 then raise exception using errcode='22023',message='Capacity override reason is too long'; end if;
  end if;
  return issues;
 end $fn$;

 create function public.enrolments_context(p_profile_id uuid default null,p_athlete_id uuid default null,p_search text default '') returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $fn$
 declare cid uuid;needle text:=lower(btrim(coalesce(p_search,'')));result jsonb;actor_today date:=(now() at time zone 'Europe/London')::date;
 begin
  cid:=public.member_management_club();
  if p_profile_id is null and p_athlete_id is null then raise exception using errcode='22023',message='Choose a class or athlete'; end if;
  if length(needle)>100 then raise exception using errcode='22023',message='Search is too long'; end if;
  if p_profile_id is not null and not exists(select 1 from public.class_profiles where id=p_profile_id and club_id=cid) then raise exception using errcode='42501',message='Class outside club'; end if;
  if p_athlete_id is not null and not exists(select 1 from public.member_athletes where id=p_athlete_id and club_id=cid) then raise exception using errcode='42501',message='Athlete outside club'; end if;
  select jsonb_build_object(
   'today',actor_today,
   'counts',jsonb_build_object('active',(select count(*) from public.enrolments where club_id=cid and class_profile_id=p_profile_id and status='active'),'trial',(select count(*) from public.enrolments where club_id=cid and class_profile_id=p_profile_id and status='trial'),'waiting',(select count(*) from public.enrolments where club_id=cid and class_profile_id=p_profile_id and status='waiting')),
   'athletes',coalesce((select jsonb_agg(to_jsonb(a) order by a.display_name,a.id) from (select ma.id,ma.family_id,ma.display_name,mf.display_name family_name,ma.status from public.member_athletes ma join public.member_families mf on mf.id=ma.family_id and mf.club_id=ma.club_id where ma.club_id=cid and ma.status='active' and mf.status='active' and (p_athlete_id is null or ma.id=p_athlete_id) and (needle='' or strpos(lower(ma.display_name),needle)>0 or strpos(lower(mf.display_name),needle)>0) order by ma.display_name limit 30)a),'[]'::jsonb),
   'profiles',coalesce((select jsonb_agg(to_jsonb(p) order by p.name,p.id) from (select cp.id,cp.name,cp.active,cp.publication_status,cp.capacity,cp.start_date,cp.end_date from public.class_profiles cp where cp.club_id=cid and ((p_profile_id is not null and cp.id=p_profile_id) or (p_profile_id is null and ((cp.active and cp.publication_status='published' and (needle='' or strpos(lower(cp.name),needle)>0)) or exists(select 1 from public.enrolments e where e.club_id=cid and e.athlete_id=p_athlete_id and e.class_profile_id=cp.id)))) order by cp.active desc,cp.name limit 50)p),'[]'::jsonb),
   'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'class_profile_id',c.class_profile_id,'weekday',c.weekday,'start_time',c.start_time,'finish_time',c.finish_time,'venue_id',c.venue_id,'venue_name',v.name,'capacity',cp.capacity,'active',c.active,'effective_from',c.effective_from,'effective_to',c.effective_to,'occupied_today',(select count(distinct e.id) from public.enrolments e join public.enrolment_session_selections s on s.enrolment_id=e.id and s.club_id=e.club_id where e.club_id=cid and e.status in ('active','trial') and s.class_id=c.id and s.superseded_at is null and actor_today between s.selected_from and coalesce(s.selected_to,'infinity'::date)),'occupancy',coalesce((select jsonb_agg(jsonb_build_object('enrolment_id',e.id,'start_date',s.selected_from,'end_date',s.selected_to)) from public.enrolments e join public.enrolment_session_selections s on s.enrolment_id=e.id and s.club_id=e.club_id where e.club_id=cid and e.status in ('active','trial') and s.class_id=c.id and s.superseded_at is null),'[]'::jsonb)) order by c.weekday,c.start_time,c.id)
     from public.classes c join public.class_profiles cp on cp.id=c.class_profile_id and cp.club_id=c.club_id join public.venues v on v.id=c.venue_id
     where c.club_id=cid and ((p_profile_id is not null and c.class_profile_id=p_profile_id) or (p_profile_id is null and (exists(select 1 from public.enrolments e where e.club_id=cid and e.athlete_id=p_athlete_id and e.class_profile_id=c.class_profile_id) or (cp.active and cp.publication_status='published' and (needle='' or strpos(lower(cp.name),needle)>0)))))),'[]'::jsonb),
   'enrolments',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'athlete_id',e.athlete_id,'athlete_name',a.display_name,'family_id',e.family_id,'family_name',f.display_name,'class_profile_id',e.class_profile_id,'class_name',p.name,'status',e.status,'start_date',e.start_date,'end_date',e.end_date,'source',e.source,'internal_notes',e.internal_notes,'updated_at',e.updated_at,
      'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'class_id',s.class_id,'selected_from',s.selected_from,'selected_to',s.selected_to,'superseded_at',s.superseded_at,'weekday',c.weekday,'start_time',c.start_time,'finish_time',c.finish_time,'venue_name',v.name) order by s.selected_from,c.weekday,c.start_time) from public.enrolment_session_selections s join public.classes c on c.id=s.class_id join public.venues v on v.id=c.venue_id where s.club_id=cid and s.enrolment_id=e.id),'[]'::jsonb),
      'history',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'from_status',h.from_status,'to_status',h.to_status,'effective_date',h.effective_date,'reason',h.reason,'created_at',h.created_at) order by h.created_at desc,h.id desc) from public.enrolment_status_history h where h.club_id=cid and h.enrolment_id=e.id),'[]'::jsonb)) order by case e.status when 'active' then 1 when 'trial' then 2 when 'waiting' then 3 when 'paused' then 4 when 'enquiry' then 5 else 6 end,a.display_name,e.start_date)
     from public.enrolments e join public.member_athletes a on a.id=e.athlete_id and a.club_id=e.club_id join public.member_families f on f.id=e.family_id and f.club_id=e.club_id join public.class_profiles p on p.id=e.class_profile_id and p.club_id=e.club_id where e.club_id=cid and ((p_profile_id is not null and e.class_profile_id=p_profile_id) or (p_athlete_id is not null and e.athlete_id=p_athlete_id))),'[]'::jsonb)
  ) into result;
  return result;
 end $fn$;

 create function public.enrolments_command(p_action text,p_enrolment_id uuid,p_data jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $fn$
 declare cid uuid;e public.enrolments%rowtype;p public.class_profiles%rowtype;a public.member_athletes%rowtype;receipt public.enrolment_command_log%rowtype;
  digest text;result jsonb;details jsonb:='{}';issues jsonb:='[]';chosen uuid[];rid uuid:=p_enrolment_id;new_status text;old_status text;reason text;
  start_on date;end_on date;change_on date;actor_today date:=(now() at time zone 'Europe/London')::date;selection_changed boolean;
 begin
  cid:=public.member_management_club();
  if p_request_id is null or p_data is null or jsonb_typeof(p_data)<>'object' or p_action not in ('create','edit','status','end') then raise exception using errcode='22023',message='Invalid enrolment command'; end if;
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('athlete_id','class_profile_id','status','start_date','end_date','source','internal_notes','session_ids','change_from','override_reason','reason','final_date')) then raise exception using errcode='22023',message='Unsupported enrolment fields'; end if;
  digest:=md5(jsonb_build_object('action',p_action,'id',p_enrolment_id,'data',p_data)::text);
  perform pg_advisory_xact_lock(hashtextextended(cid::text||p_request_id::text,0));
  select * into receipt from public.enrolment_command_log where club_id=cid and request_id=p_request_id;
  if found then if receipt.payload_hash<>digest or receipt.actor_id<>auth.uid() then raise exception 'Request identifier already used for another command';end if;return receipt.result;end if;
  if p_action='create' then
   if p_enrolment_id is not null then raise exception using errcode='22023',message='New enrolment cannot supply an identifier';end if;
   select * into a from public.member_athletes where id=(p_data->>'athlete_id')::uuid and club_id=cid and status='active' for share;
   if not found or not exists(select 1 from public.member_families where id=a.family_id and club_id=cid and status='active') then raise exception using errcode='42501',message='Active athlete and family required in this club';end if;
   select * into p from public.class_profiles where id=(p_data->>'class_profile_id')::uuid and club_id=cid and active and publication_status='published' for share;
   if not found then raise exception using errcode='42501',message='Active published class required in this club';end if;
   new_status:=p_data->>'status';start_on=(p_data->>'start_date')::date;end_on=nullif(p_data->>'end_date','')::date;
   if new_status not in ('enquiry','trial','waiting','active','paused') or start_on is null or end_on<start_on or length(coalesce(p_data->>'source',''))>120 or length(coalesce(p_data->>'internal_notes',''))>4000 then raise exception using errcode='22023',message='Invalid enrolment details';end if;
   insert into public.enrolments(club_id,family_id,athlete_id,class_profile_id,status,start_date,end_date,source,internal_notes,created_by,updated_by)
    values(cid,a.family_id,a.id,p.id,new_status,start_on,end_on,coalesce(p_data->>'source',''),coalesce(p_data->>'internal_notes',''),auth.uid(),auth.uid()) returning * into e;rid:=e.id;
  else
   select * into e from public.enrolments where id=p_enrolment_id and club_id=cid for update;
   if not found then raise exception using errcode='42501',message='Enrolment outside club';end if;
   if e.status='ended' then raise exception using errcode='23514',message='Ended enrolments are historical records and cannot be reopened';end if;
   select * into p from public.class_profiles where id=e.class_profile_id and club_id=cid for share;
  end if;
  -- One profile-wide lock serialises capacity checks across different athletes.
  perform pg_advisory_xact_lock(hashtextextended(cid::text||e.class_profile_id::text,0));

  if p_action in ('create','edit') then
   if jsonb_typeof(p_data->'session_ids') is distinct from 'array' or jsonb_array_length(p_data->'session_ids')<1 then raise exception using errcode='22023',message='Select at least one weekly session';end if;
   select array_agg(distinct value::uuid order by value::uuid) into chosen from jsonb_array_elements_text(p_data->'session_ids');
   if cardinality(chosen)<>jsonb_array_length(p_data->'session_ids') or exists(select 1 from unnest(chosen) id where not exists(select 1 from public.classes c where c.id=id and c.club_id=cid and c.class_profile_id=e.class_profile_id and c.active)) then raise exception using errcode='42501',message='Weekly sessions must be active recurrences for this class and club';end if;
   if p_action='edit' then
    start_on=(p_data->>'start_date')::date;end_on=nullif(p_data->>'end_date','')::date;change_on=(p_data->>'change_from')::date;
    if start_on is null or end_on<start_on or change_on is null or change_on<actor_today or change_on<start_on then raise exception using errcode='22023',message='Choose valid inclusive and future change dates';end if;
    if e.start_date<=actor_today and start_on<>e.start_date then raise exception using errcode='22023',message='A started enrolment keeps its original start date';end if;
    if e.start_date>actor_today and start_on<actor_today then raise exception using errcode='22023',message='A future enrolment cannot be moved into the past';end if;
    if end_on is not null and end_on<actor_today then raise exception using errcode='22023',message='Use End enrolment for a past or current final date';end if;
    if length(coalesce(p_data->>'source',''))>120 or length(coalesce(p_data->>'internal_notes',''))>4000 then raise exception using errcode='22023',message='Source or notes are too long';end if;
    selection_changed:=start_on is distinct from e.start_date or end_on is distinct from e.end_date or chosen is distinct from (select array_agg(class_id order by class_id) from public.enrolment_session_selections where enrolment_id=e.id and club_id=cid and superseded_at is null and coalesce(selected_to,'infinity'::date)>=change_on);
    update public.enrolments set start_date=start_on,end_date=end_on,source=coalesce(p_data->>'source',''),internal_notes=coalesce(p_data->>'internal_notes','') where id=e.id returning * into e;
    if selection_changed then
     update public.enrolment_session_selections set superseded_at=case when selected_from>=change_on then now() else superseded_at end,selected_to=case when selected_from<change_on then least(coalesce(selected_to,'infinity'::date),change_on-1) else selected_to end where enrolment_id=e.id and club_id=cid and superseded_at is null and coalesce(selected_to,'infinity'::date)>=change_on;
    end if;
   else change_on:=e.start_date;selection_changed:=true;end if;
   if selection_changed then
    insert into public.enrolment_session_selections(club_id,enrolment_id,class_profile_id,class_id,selected_from,selected_to,created_by)
     select cid,e.id,e.class_profile_id,c.id,greatest(change_on,e.start_date,coalesce(c.effective_from,e.start_date),coalesce(p.start_date,e.start_date)),nullif(least(coalesce(e.end_date,'infinity'::date),coalesce(c.effective_to,'infinity'::date),coalesce(p.end_date,'infinity'::date)),'infinity'::date),auth.uid()
     from public.classes c where c.club_id=cid and c.class_profile_id=e.class_profile_id and c.id=any(chosen)
      and greatest(change_on,e.start_date,coalesce(c.effective_from,e.start_date),coalesce(p.start_date,e.start_date))<=least(coalesce(e.end_date,'infinity'::date),coalesce(c.effective_to,'infinity'::date),coalesce(p.end_date,'infinity'::date));
    if not found or (select count(*) from public.enrolment_session_selections where enrolment_id=e.id and club_id=cid and created_at>=transaction_timestamp() and superseded_at is null)<>cardinality(chosen) then raise exception using errcode='23514',message='Selected sessions do not overlap the enrolment and class operating dates';end if;
   end if;
   if p_action='create' then insert into public.enrolment_status_history(club_id,enrolment_id,from_status,to_status,effective_date,reason,actor_id) values(cid,e.id,null,e.status,e.start_date,'Enrolment created',auth.uid());end if;
   issues:=public.enrolments_validate(e.id,p_data->>'override_reason');
  elsif p_action='status' then
   new_status:=p_data->>'status';reason=btrim(coalesce(p_data->>'reason',''));
   if new_status not in ('enquiry','trial','waiting','active','paused') or new_status=e.status or length(reason) not between 1 and 500 then raise exception using errcode='22023',message='Choose a different status and record a reason';end if;
   old_status:=e.status;update public.enrolments set status=new_status where id=e.id returning * into e;
   insert into public.enrolment_status_history(club_id,enrolment_id,from_status,to_status,effective_date,reason,actor_id) values(cid,e.id,old_status,e.status,actor_today,reason,auth.uid());
   issues:=public.enrolments_validate(e.id,p_data->>'override_reason');
  elsif p_action='end' then
   end_on=(p_data->>'final_date')::date;reason=btrim(coalesce(p_data->>'reason',''));
   if e.status='ended' or end_on is null or end_on<e.start_date or end_on>actor_today or length(reason) not between 1 and 500 then raise exception using errcode='22023',message='Choose an inclusive final date through today and record a reason';end if;
   new_status:=e.status;update public.enrolments set status='ended',end_date=end_on where id=e.id returning * into e;
   update public.enrolment_session_selections set superseded_at=case when selected_from>end_on then now() else superseded_at end,selected_to=case when selected_from<=end_on then least(coalesce(selected_to,'infinity'::date),end_on) else selected_to end where enrolment_id=e.id and club_id=cid and superseded_at is null and coalesce(selected_to,'infinity'::date)>end_on;
   insert into public.enrolment_status_history(club_id,enrolment_id,from_status,to_status,effective_date,reason,actor_id) values(cid,e.id,new_status,'ended',end_on,reason,auth.uid());
  end if;
  result:=jsonb_build_object('id',e.id,'status',e.status);details:=jsonb_build_object('capacity_override_reason',nullif(btrim(coalesce(p_data->>'override_reason','')),''),'capacity_issues',issues);
  insert into public.enrolment_command_log(club_id,enrolment_id,actor_id,action,request_id,payload_hash,result,details) values(cid,e.id,auth.uid(),p_action,p_request_id,digest,result,details);
  return result;
 end $fn$;

 alter function public.enrolment_row_guard() owner to postgres;
 alter function public.enrolment_selection_guard() owner to postgres;
 alter function public.enrolment_append_only() owner to postgres;
 alter function public.enrolments_validate(uuid,text) owner to postgres;
 alter function public.enrolments_context(uuid,uuid,text) owner to postgres;
 alter function public.enrolments_command(text,uuid,jsonb,uuid) owner to postgres;
 revoke all on function public.enrolment_row_guard(),public.enrolment_selection_guard(),public.enrolment_append_only(),public.enrolments_validate(uuid,text),public.enrolments_context(uuid,uuid,text),public.enrolments_command(text,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
 grant execute on function public.enrolments_context(uuid,uuid,text),public.enrolments_command(text,uuid,jsonb,uuid) to authenticated;

 if (select count(*) from pg_temp.enrolments_baseline)<>9 then raise exception 'Preservation baseline incomplete';end if;
 for baseline in select * from pg_temp.enrolments_baseline loop
  execute format('select count(*),md5(coalesce(string_agg(to_jsonb(x)::text,'''' order by id),'''')) from public.%I x',baseline.table_name) into n,h;
  if n is distinct from baseline.n or h is distinct from baseline.h then raise exception 'Existing records changed in %; rolling back',baseline.table_name;end if;
 end loop;
 if exists(select 1 from public.enrolments) or exists(select 1 from public.enrolment_session_selections) or exists(select 1 from public.enrolment_status_history) or exists(select 1 from public.enrolment_command_log) then raise exception 'Migration unexpectedly created enrolment data';end if;
 if exists(select 1 from unnest(array['enrolments','enrolment_session_selections','enrolment_status_history','enrolment_command_log']) t(name) where not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid=to_regclass('public.'||t.name)) or has_table_privilege('authenticated','public.'||t.name,'INSERT,UPDATE,DELETE,TRUNCATE')) then raise exception 'Enrolment RLS or write privileges are unsafe';end if;
end
$enrolments_migration$;
commit;
