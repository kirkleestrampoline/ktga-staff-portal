-- PREPARED, NOT RUN. Forward-only internal Registers and Attendance foundation.
-- Does not load/cancel shifts, change enrolments, generate charges, or mutate existing operational rows.
begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

do $migration$
declare t text;n bigint;h text;before_row record;after_n bigint;after_h text;
begin
 if to_regclass('public.class_occurrences') is not null or to_regclass('public.attendance_records') is not null then raise exception 'Registers foundation is already installed or conflicts with existing tables'; end if;
 if to_regprocedure('public.member_management_club()') is null or (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.member_management_club()'))<>'32a6d679d0123a0543c10c918884092a' then raise exception 'Member authority differs from reviewed schema'; end if;
 if to_regprocedure('public.classes_command(text,uuid,jsonb,uuid)') is null or (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.classes_command(text,uuid,jsonb,uuid)'))<>'5f18892209c305a462f0bbf28884228a' then raise exception 'Classes lifecycle authority differs from reviewed schema'; end if;
 if to_regprocedure('public.enrolments_command(text,uuid,jsonb,uuid)') is null or (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.enrolments_command(text,uuid,jsonb,uuid)'))<>'2d63f14a82a1f9e232669aca7c910b3c' then raise exception 'Enrolments authority differs from reviewed schema'; end if;
 if exists(select 1 from unnest(array['member_families','member_athletes','class_profiles','classes','class_categories','class_programmes','venues','enrolments','enrolment_session_selections','enrolment_status_history','scheduled_shifts','schedule_occurrence_exclusions','shifts','employment_records','timesheets','invoices']) x(name) where to_regclass('public.'||x.name) is null) then raise exception 'Required Members, Classes, Enrolments, staffing or preservation table is missing'; end if;
 lock table public.member_families,public.member_athletes,public.class_profiles,public.classes,public.enrolments,public.enrolment_session_selections,public.enrolment_status_history,public.scheduled_shifts,public.schedule_occurrence_exclusions,public.shifts,public.employment_records,public.timesheets,public.invoices in share row exclusive mode;
 create temporary table pg_temp.attendance_baseline(table_name text primary key,n bigint,h text) on commit drop;
 foreach t in array array['member_families','member_athletes','class_profiles','classes','enrolments','enrolment_session_selections','enrolment_status_history','scheduled_shifts','schedule_occurrence_exclusions','shifts','employment_records','timesheets','invoices'] loop
  execute format('select count(*),md5(coalesce(string_agg(to_jsonb(x)::text,'''' order by id),'''')) from public.%I x',t) into n,h;insert into pg_temp.attendance_baseline values(t,n,h);
 end loop;

 create table public.class_occurrences(
  id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete restrict,
  class_profile_id uuid not null,class_id uuid not null,occurrence_date date not null,
  class_name text not null check(length(btrim(class_name)) between 1 and 200),start_time time not null,finish_time time not null,
  venue_id uuid not null,venue_name text not null check(length(btrim(venue_name)) between 1 and 200),
  opened_at timestamptz not null default now(),opened_by uuid references public.profiles(id) on delete set null,
  constraint class_occurrences_class_fk foreign key(club_id,class_profile_id,class_id) references public.classes(club_id,class_profile_id,id) on delete restrict,
  unique(club_id,id),unique(club_id,class_id,occurrence_date)
 );
 create index class_occurrences_date_idx on public.class_occurrences(club_id,occurrence_date,start_time);

 create table public.attendance_records(
  id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete restrict,
  occurrence_id uuid not null,class_profile_id uuid not null,class_id uuid not null,family_id uuid not null,athlete_id uuid not null,enrolment_id uuid not null,
  is_trial boolean not null,status text not null default 'unmarked' check(status in ('unmarked','present','late','absent','apology')),
  arrival_time time,note text not null default '' check(length(note)<=1000),
  created_at timestamptz not null default now(),created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id) on delete set null,
  constraint attendance_arrival_valid check(status='late' or arrival_time is null),
  constraint attendance_occurrence_fk foreign key(club_id,occurrence_id) references public.class_occurrences(club_id,id) on delete restrict,
  constraint attendance_class_fk foreign key(club_id,class_profile_id,class_id) references public.classes(club_id,class_profile_id,id) on delete restrict,
  constraint attendance_family_fk foreign key(club_id,family_id) references public.member_families(club_id,id) on delete restrict,
  constraint attendance_athlete_family_fk foreign key(club_id,family_id,athlete_id) references public.member_athletes(club_id,family_id,id) on delete restrict,
  constraint attendance_enrolment_fk foreign key(club_id,enrolment_id) references public.enrolments(club_id,id) on delete restrict,
  unique(club_id,id),unique(club_id,occurrence_id,athlete_id)
 );
 create index attendance_athlete_recent_idx on public.attendance_records(club_id,athlete_id,occurrence_id);

 create table public.attendance_audit(
  id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete restrict,
  occurrence_id uuid not null,attendance_record_id uuid not null,athlete_id uuid not null,actor_id uuid references public.profiles(id) on delete set null,
  request_id uuid not null,created_at timestamptz not null default now(),previous_status text,new_status text not null,
  previous_arrival_time time,new_arrival_time time,previous_note text,new_note text,
  foreign key(club_id,occurrence_id) references public.class_occurrences(club_id,id) on delete restrict,
  foreign key(club_id,attendance_record_id) references public.attendance_records(club_id,id) on delete restrict
 );
 create index attendance_audit_record_idx on public.attendance_audit(club_id,attendance_record_id,created_at,id);

 create table public.attendance_command_receipts(
  id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete restrict,
  occurrence_id uuid not null,attendance_record_id uuid,actor_id uuid references public.profiles(id) on delete set null,
  action text not null check(action in ('open','mark')),request_id uuid not null,payload_hash text not null,result jsonb not null,created_at timestamptz not null default now(),
  foreign key(club_id,occurrence_id) references public.class_occurrences(club_id,id) on delete restrict,
  unique(club_id,request_id)
 );

 create function public.attendance_append_only() returns trigger language plpgsql set search_path=pg_catalog,public as $fn$
 begin raise exception using errcode='23503',message='Attendance history is append only';end $fn$;
 create trigger attendance_audit_append_only before update or delete on public.attendance_audit for each row execute function public.attendance_append_only();
 create trigger attendance_receipts_append_only before update or delete on public.attendance_command_receipts for each row execute function public.attendance_append_only();
 create function public.attendance_record_guard() returns trigger language plpgsql set search_path=pg_catalog,public as $fn$
 begin
  if tg_op='DELETE' then raise exception using errcode='23503',message='Attendance records cannot be deleted';end if;
  if (new.id,new.club_id,new.occurrence_id,new.class_profile_id,new.class_id,new.family_id,new.athlete_id,new.enrolment_id,new.is_trial,new.created_at,new.created_by) is distinct from (old.id,old.club_id,old.occurrence_id,old.class_profile_id,old.class_id,old.family_id,old.athlete_id,old.enrolment_id,old.is_trial,old.created_at,old.created_by) then raise exception using errcode='23514',message='Attendance identity cannot change';end if;
  new.updated_at:=now();new.updated_by:=auth.uid();return new;
 end $fn$;
 create trigger attendance_record_guard before update or delete on public.attendance_records for each row execute function public.attendance_record_guard();
 create function public.attendance_occurrence_guard() returns trigger language plpgsql set search_path=pg_catalog,public as $fn$
 begin raise exception using errcode='23503',message='Dated class occurrences are immutable';end $fn$;
 create trigger attendance_occurrence_guard before update or delete on public.class_occurrences for each row execute function public.attendance_occurrence_guard();

 alter table public.class_occurrences enable row level security;alter table public.class_occurrences force row level security;
 alter table public.attendance_records enable row level security;alter table public.attendance_records force row level security;
 alter table public.attendance_audit enable row level security;alter table public.attendance_audit force row level security;
 alter table public.attendance_command_receipts enable row level security;alter table public.attendance_command_receipts force row level security;
 revoke all on public.class_occurrences,public.attendance_records,public.attendance_audit,public.attendance_command_receipts from public,anon,authenticated,service_role;

 foreach t in array array['member_families','member_athletes','class_profiles','classes','enrolments','enrolment_session_selections','enrolment_status_history','scheduled_shifts','schedule_occurrence_exclusions','shifts','employment_records','timesheets','invoices'] loop
  select * into before_row from pg_temp.attendance_baseline where table_name=t;
  execute format('select count(*),md5(coalesce(string_agg(to_jsonb(x)::text,'''' order by id),'''')) from public.%I x',t) into after_n,after_h;
  if (after_n,after_h) is distinct from (before_row.n,before_row.h) then raise exception 'Preservation fingerprint changed for %',t;end if;
 end loop;
end $migration$;

create function public.attendance_actor_club() returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $fn$
declare cid uuid;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Authentication required';end if;
 select p.club_id into cid from public.profiles p join public.clubs c on c.id=p.club_id where p.id=auth.uid() and p.is_active and c.active and p.role in ('club_owner','org_admin','coach','head_coach');
 if cid is null then raise exception using errcode='42501',message='Register access is not authorised';end if;return cid;
end $fn$;
create function public.attendance_is_admin(p_club uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $fn$
 select exists(select 1 from public.profiles p join public.clubs c on c.id=p.club_id where p.id=auth.uid() and p.club_id=p_club and p.is_active and c.active and p.role in ('club_owner','org_admin'));
$fn$;
create function public.attendance_can_access(p_club uuid,p_class uuid,p_date date) returns boolean language sql stable security definer set search_path=pg_catalog,public as $fn$
 select p_club=public.attendance_actor_club() and (public.attendance_is_admin(p_club) or exists(select 1 from public.profiles p join public.scheduled_shifts s on s.profile_id=p.id and s.club_id=p.club_id where p.id=auth.uid() and p.club_id=p_club and p.is_active and p.role in ('coach','head_coach') and s.class_id=p_class and s.shift_date=p_date and s.status<>'cancelled'));
$fn$;
create function public.attendance_occurrence_available(p_club uuid,p_class uuid,p_date date) returns boolean language sql stable security definer set search_path=pg_catalog,public as $fn$
 select exists(select 1 from public.classes c join public.class_profiles p on p.id=c.class_profile_id and p.club_id=c.club_id join public.venues v on v.id=c.venue_id and v.club_id=c.club_id where c.id=p_class and c.club_id=p_club and c.active and p.active and p.publication_status='published' and v.active and extract(dow from p_date)::integer=c.weekday and p_date between coalesce(c.effective_from,'-infinity'::date) and coalesce(c.effective_to,'infinity'::date) and p_date between coalesce(p.start_date,'-infinity'::date) and coalesce(p.end_date,'infinity'::date)
 and not exists(select 1 from public.schedule_occurrence_exclusions x where x.class_id=c.id and x.shift_date=p_date and x.staffing_slot_id is null)
 and not (exists(select 1 from public.class_staffing_slots slot where slot.class_id=c.id and slot.active) and not exists(select 1 from public.class_staffing_slots slot where slot.class_id=c.id and slot.active and not exists(select 1 from public.schedule_occurrence_exclusions x where x.class_id=c.id and x.shift_date=p_date and x.staffing_slot_id=slot.id)))
 and not (exists(select 1 from public.scheduled_shifts s where s.club_id=p_club and s.class_id=c.id and s.shift_date=p_date) and not exists(select 1 from public.scheduled_shifts s where s.club_id=p_club and s.class_id=c.id and s.shift_date=p_date and s.status<>'cancelled')));
$fn$;
create function public.attendance_effective_status(p_enrolment uuid,p_date date) returns text language sql stable security definer set search_path=pg_catalog,public as $fn$
 select case when p_date between e.start_date and coalesce(e.end_date,'infinity'::date) then coalesce((select h.to_status from public.enrolment_status_history h where h.enrolment_id=e.id and h.club_id=e.club_id and (h.effective_date<p_date or h.effective_date=p_date and h.to_status<>'ended') order by h.effective_date desc,h.created_at desc,h.id desc limit 1),e.status) end from public.enrolments e where e.id=p_enrolment;
$fn$;
create function public.attendance_expected_count(p_club uuid,p_class uuid,p_date date) returns integer language sql stable security definer set search_path=pg_catalog,public as $fn$
 select count(distinct e.athlete_id)::integer from public.enrolments e join public.enrolment_session_selections s on s.enrolment_id=e.id and s.club_id=e.club_id where e.club_id=p_club and s.class_id=p_class and p_date between s.selected_from and coalesce(s.selected_to,'infinity'::date) and public.attendance_effective_status(e.id,p_date) in ('active','trial');
$fn$;

create policy class_occurrences_read on public.class_occurrences for select to authenticated using(public.attendance_can_access(club_id,class_id,occurrence_date));
create policy attendance_records_read on public.attendance_records for select to authenticated using(exists(select 1 from public.class_occurrences o where o.id=occurrence_id and o.club_id=club_id and public.attendance_can_access(o.club_id,o.class_id,o.occurrence_date)));
create policy attendance_audit_read on public.attendance_audit for select to authenticated using(exists(select 1 from public.class_occurrences o where o.id=occurrence_id and o.club_id=club_id and public.attendance_can_access(o.club_id,o.class_id,o.occurrence_date)));
create policy attendance_receipts_read on public.attendance_command_receipts for select to authenticated using(exists(select 1 from public.class_occurrences o where o.id=occurrence_id and o.club_id=club_id and public.attendance_can_access(o.club_id,o.class_id,o.occurrence_date)));

create function public.attendance_registers_for_date(p_date date) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $fn$
declare cid uuid:=public.attendance_actor_club();result jsonb;
begin
 if p_date is null then raise exception using errcode='22023',message='Register date is required';end if;
 select coalesce(jsonb_agg(jsonb_build_object('class_id',c.id,'class_profile_id',c.class_profile_id,'occurrence_id',o.id,'occurrence_date',p_date,'class_name',coalesce(o.class_name,p.name),'start_time',coalesce(o.start_time,c.start_time),'finish_time',coalesce(o.finish_time,c.finish_time),'venue_id',c.venue_id,'venue_name',coalesce(o.venue_name,v.name),'category_id',coalesce(p.category_id,pr.category_id),'category_name',cc.name,'programme_id',p.programme_id,'programme_name',pr.name,'expected_count',coalesce(counts.expected_count,public.attendance_expected_count(cid,c.id,p_date)),'marked_count',coalesce(counts.marked_count,0),'completed',coalesce(counts.expected_count>0 and counts.marked_count=counts.expected_count,false)) order by coalesce(o.start_time,c.start_time),coalesce(o.class_name,p.name),c.id),'[]'::jsonb) into result
 from public.classes c join public.class_profiles p on p.id=c.class_profile_id and p.club_id=c.club_id join public.venues v on v.id=c.venue_id and v.club_id=c.club_id left join public.class_programmes pr on pr.id=p.programme_id and pr.club_id=p.club_id left join public.class_categories cc on cc.id=coalesce(p.category_id,pr.category_id) and cc.club_id=p.club_id left join public.class_occurrences o on o.club_id=c.club_id and o.class_id=c.id and o.occurrence_date=p_date left join lateral(select count(*)::integer expected_count,count(*) filter(where r.status<>'unmarked')::integer marked_count from public.attendance_records r where r.club_id=cid and r.occurrence_id=o.id) counts on o.id is not null
 where c.club_id=cid and (o.id is not null or public.attendance_occurrence_available(cid,c.id,p_date)) and public.attendance_can_access(cid,c.id,p_date);
 return result;
end $fn$;

create function public.attendance_open_register(p_class_id uuid,p_date date,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $fn$
declare cid uuid:=public.attendance_actor_club();c public.classes%rowtype;p public.class_profiles%rowtype;o public.class_occurrences%rowtype;receipt public.attendance_command_receipts%rowtype;digest text;result jsonb;inserted record;
begin
 if p_class_id is null or p_date is null or p_request_id is null then raise exception using errcode='22023',message='Class, date and request ID are required';end if;
 if not public.attendance_can_access(cid,p_class_id,p_date) then raise exception using errcode='42501',message='Register unavailable';end if;
 digest:=md5(jsonb_build_object('action','open','class_id',p_class_id,'date',p_date)::text);perform pg_advisory_xact_lock(hashtextextended(cid::text||p_request_id::text,0));select * into receipt from public.attendance_command_receipts where club_id=cid and request_id=p_request_id;if found then if receipt.payload_hash<>digest or receipt.actor_id<>auth.uid() then raise exception using errcode='22023',message='Request ID was already used for different input';end if;return receipt.result;end if;
 perform pg_advisory_xact_lock(hashtextextended(cid::text||p_class_id::text||p_date::text,0));
 select * into o from public.class_occurrences where club_id=cid and class_id=p_class_id and occurrence_date=p_date for update;
 if not found then
  if not public.attendance_occurrence_available(cid,p_class_id,p_date) then raise exception using errcode='42501',message='Class is not available on this date';end if;
  select * into c from public.classes where id=p_class_id and club_id=cid for share;select * into p from public.class_profiles where id=c.class_profile_id and club_id=cid for share;
  insert into public.class_occurrences(club_id,class_profile_id,class_id,occurrence_date,class_name,start_time,finish_time,venue_id,venue_name,opened_by) select cid,c.class_profile_id,c.id,p_date,p.name,c.start_time,c.finish_time,c.venue_id,v.name,auth.uid() from public.venues v where v.id=c.venue_id returning * into o;
 end if;
 for inserted in insert into public.attendance_records(club_id,occurrence_id,class_profile_id,class_id,family_id,athlete_id,enrolment_id,is_trial,created_by,updated_by)
  select cid,o.id,o.class_profile_id,o.class_id,e.family_id,e.athlete_id,e.id,public.attendance_effective_status(e.id,p_date)='trial',auth.uid(),auth.uid() from public.enrolments e join public.enrolment_session_selections s on s.enrolment_id=e.id and s.club_id=e.club_id where e.club_id=cid and s.class_id=o.class_id and p_date between s.selected_from and coalesce(s.selected_to,'infinity'::date) and public.attendance_effective_status(e.id,p_date) in ('active','trial') on conflict(club_id,occurrence_id,athlete_id) do nothing returning *
 loop insert into public.attendance_audit(club_id,occurrence_id,attendance_record_id,athlete_id,actor_id,request_id,previous_status,new_status,previous_arrival_time,new_arrival_time,previous_note,new_note) values(cid,o.id,inserted.id,inserted.athlete_id,auth.uid(),p_request_id,null,'unmarked',null,null,null,'');end loop;
 select jsonb_build_object('occurrence',jsonb_build_object('id',o.id,'class_id',o.class_id,'class_profile_id',o.class_profile_id,'occurrence_date',o.occurrence_date,'class_name',o.class_name,'start_time',o.start_time,'finish_time',o.finish_time,'venue_name',o.venue_name,'expected_count',count(r.id),'marked_count',count(r.id) filter(where r.status<>'unmarked'),'completed',count(r.id)>0 and count(r.id)=count(r.id) filter(where r.status<>'unmarked')),'athletes',coalesce(jsonb_agg(jsonb_build_object('id',r.id,'athlete_id',r.athlete_id,'athlete_name',a.display_name,'family_id',r.family_id,'enrolment_id',r.enrolment_id,'is_trial',r.is_trial,'status',r.status,'arrival_time',r.arrival_time,'note',r.note,'updated_at',r.updated_at,'updated_by_name',actor.full_name) order by a.display_name,a.id) filter(where r.id is not null),'[]'::jsonb)) into result from public.attendance_records r join public.member_athletes a on a.id=r.athlete_id and a.club_id=r.club_id left join public.profiles actor on actor.id=r.updated_by where r.club_id=cid and r.occurrence_id=o.id;
 insert into public.attendance_command_receipts(club_id,occurrence_id,actor_id,action,request_id,payload_hash,result) values(cid,o.id,auth.uid(),'open',p_request_id,digest,result);return result;
end $fn$;

create function public.attendance_command(p_record_id uuid,p_status text,p_arrival_time time,p_note text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $fn$
declare cid uuid:=public.attendance_actor_club();r public.attendance_records%rowtype;o public.class_occurrences%rowtype;receipt public.attendance_command_receipts%rowtype;digest text;result jsonb;
begin
 if p_record_id is null or p_request_id is null or p_status not in ('unmarked','present','late','absent','apology') or length(coalesce(p_note,''))>1000 or (p_status<>'late' and p_arrival_time is not null) then raise exception using errcode='22023',message='Invalid attendance command';end if;
 digest:=md5(jsonb_build_object('record_id',p_record_id,'status',p_status,'arrival_time',p_arrival_time,'note',coalesce(p_note,''))::text);perform pg_advisory_xact_lock(hashtextextended(cid::text||p_request_id::text,0));select * into receipt from public.attendance_command_receipts where club_id=cid and request_id=p_request_id;if found then if receipt.payload_hash<>digest or receipt.actor_id<>auth.uid() then raise exception using errcode='22023',message='Request ID was already used for different input';end if;return receipt.result;end if;
 select * into r from public.attendance_records where id=p_record_id and club_id=cid for update;if not found then raise exception using errcode='42501',message='Attendance record unavailable';end if;select * into o from public.class_occurrences where id=r.occurrence_id and club_id=cid;if not public.attendance_can_access(cid,o.class_id,o.occurrence_date) then raise exception using errcode='42501',message='Attendance record unavailable';end if;
 insert into public.attendance_audit(club_id,occurrence_id,attendance_record_id,athlete_id,actor_id,request_id,previous_status,new_status,previous_arrival_time,new_arrival_time,previous_note,new_note) values(cid,r.occurrence_id,r.id,r.athlete_id,auth.uid(),p_request_id,r.status,p_status,r.arrival_time,case when p_status='late' then p_arrival_time end,r.note,coalesce(p_note,''));
 update public.attendance_records set status=p_status,arrival_time=case when p_status='late' then p_arrival_time end,note=coalesce(p_note,'') where id=r.id returning * into r;
 select jsonb_build_object('id',r.id,'athlete_id',r.athlete_id,'family_id',r.family_id,'enrolment_id',r.enrolment_id,'is_trial',r.is_trial,'status',r.status,'arrival_time',r.arrival_time,'note',r.note,'updated_at',r.updated_at,'updated_by_name',p.full_name) into result from public.profiles p where p.id=auth.uid();
 insert into public.attendance_command_receipts(club_id,occurrence_id,attendance_record_id,actor_id,action,request_id,payload_hash,result) values(cid,r.occurrence_id,r.id,auth.uid(),'mark',p_request_id,digest,result);return result;
end $fn$;

create function public.attendance_recent_for_athlete(p_athlete_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $fn$
declare cid uuid:=public.member_management_club();result jsonb;
begin
 if not exists(select 1 from public.member_athletes where id=p_athlete_id and club_id=cid) then raise exception using errcode='42501',message='Athlete unavailable';end if;
 with recent as(select r.*,o.occurrence_date,o.class_name,o.start_time,o.venue_name from public.attendance_records r join public.class_occurrences o on o.id=r.occurrence_id and o.club_id=r.club_id where r.club_id=cid and r.athlete_id=p_athlete_id and r.status<>'unmarked' order by o.occurrence_date desc,o.start_time desc limit 12)
 select jsonb_build_object('summary',jsonb_build_object('expected',count(*),'present',count(*) filter(where status='present'),'late',count(*) filter(where status='late'),'absent',count(*) filter(where status='absent'),'apology',count(*) filter(where status='apology'),'attendance_rate',case when count(*) filter(where status in ('present','late','absent'))=0 then null else round(100.0*count(*) filter(where status in ('present','late'))/count(*) filter(where status in ('present','late','absent'))) end),'records',coalesce(jsonb_agg(jsonb_build_object('occurrence_date',occurrence_date,'class_name',class_name,'start_time',start_time,'venue_name',venue_name,'status',status,'arrival_time',arrival_time,'note',note) order by occurrence_date desc,start_time desc),'[]'::jsonb)) into result from recent;return result;
end $fn$;

alter function public.attendance_actor_club() owner to postgres;alter function public.attendance_is_admin(uuid) owner to postgres;alter function public.attendance_can_access(uuid,uuid,date) owner to postgres;alter function public.attendance_occurrence_available(uuid,uuid,date) owner to postgres;alter function public.attendance_effective_status(uuid,date) owner to postgres;alter function public.attendance_expected_count(uuid,uuid,date) owner to postgres;alter function public.attendance_registers_for_date(date) owner to postgres;alter function public.attendance_open_register(uuid,date,uuid) owner to postgres;alter function public.attendance_command(uuid,text,time,text,uuid) owner to postgres;alter function public.attendance_recent_for_athlete(uuid) owner to postgres;
revoke all on function public.attendance_actor_club(),public.attendance_is_admin(uuid),public.attendance_can_access(uuid,uuid,date),public.attendance_occurrence_available(uuid,uuid,date),public.attendance_effective_status(uuid,date),public.attendance_expected_count(uuid,uuid,date),public.attendance_registers_for_date(date),public.attendance_open_register(uuid,date,uuid),public.attendance_command(uuid,text,time,text,uuid),public.attendance_recent_for_athlete(uuid) from public,anon,authenticated,service_role;
grant execute on function public.attendance_registers_for_date(date),public.attendance_open_register(uuid,date,uuid),public.attendance_command(uuid,text,time,text,uuid),public.attendance_recent_for_athlete(uuid) to authenticated;
commit;
