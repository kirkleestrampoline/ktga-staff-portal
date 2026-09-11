-- Forward only after v1_7_1. PREPARED FOR REVIEW; do not replay earlier migrations.
-- No operational DML or generation occurs while applying this migration.
begin;
set local lock_timeout='2s';
set local statement_timeout='60s';
do $classes_lifecycle_migration$
begin
do $preflight$
declare r record;
begin
 for r in select * from (values
 ('public.classes_save_profile(jsonb,jsonb)','182f1c6ea1d0b3c50403394fb3437ed8'),
 ('public.classes_calendar_data(date,date)','d3c38fa582844bb10f0a247abab84a17'),
 ('public.classes_publish(uuid)','05be1b954f4063792dacb08f2ec6cd19'),
 ('public.classes_phase1_shift_gate()','3ad6f7c69e9c69159508594edcdb05e8'),
 ('public.generate_schedule_month(date)','ed4819228b3c3248a0a88fa5afe4fa96'),
 ('public.apply_class_profile_to_session()','d895f5c5f67b33ad0208c0a59125e320'),
 ('public.propagate_class_profile_to_sessions()','a718caac1a95662f8fa468abd8d9efff'),
 ('public.set_class_profile_active(uuid,boolean)','b38df3aa7e1104e8ef0268864564b6bb'),
 ('public.delete_class_profile_if_unused(uuid)','fb68c97d279da4c00de371755069147b')
 ) expected(signature,hash) loop
  if to_regprocedure(r.signature) is null or (select md5(prosrc) from pg_proc where oid=to_regprocedure(r.signature)) is distinct from r.hash then raise exception 'Reviewed function drift: %',r.signature; end if;
 end loop;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='classes' and column_name='effective_from') or to_regclass('public.class_lifecycle_audit') is not null then raise exception 'Lifecycle schema already installed or drifted'; end if;
 if not exists(select 1 from pg_index where indexrelid=to_regclass('public.classes_profile_recurring_session_unique') and indisunique and indrelid='public.classes'::regclass and indnkeyatts=3 and pg_get_indexdef(indexrelid,1,true)='class_profile_id' and pg_get_indexdef(indexrelid,2,true)='weekday' and pg_get_indexdef(indexrelid,3,true)='start_time' and regexp_replace(pg_get_expr(indpred,indrelid),'[() ]','','g')='active=true') then raise exception 'Recurring uniqueness index differs from reviewed schema'; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.class_profiles'::regclass and conname='class_profile_dates_valid' and regexp_replace(lower(pg_get_constraintdef(oid)),'[()[:space:]]','','g')='checkend_dateisnullorstart_dateisnotnullandend_date>=start_date') then raise exception 'Class date constraint drift'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.scheduled_shifts'::regclass and tgname='trg_skip_excluded_scheduled_occurrence' and tgenabled='O') then raise exception 'Occurrence exclusion trigger missing'; end if;
 for r in select * from (values
  ('class_profiles','propagate_class_profile_to_sessions','public.propagate_class_profile_to_sessions()'),
  ('classes','apply_class_profile_to_session','public.apply_class_profile_to_session()'),
  ('scheduled_shifts','classes_phase1_shift_gate','public.classes_phase1_shift_gate()'),
  ('scheduled_shifts','trg_skip_excluded_scheduled_occurrence','public.skip_excluded_scheduled_occurrence()')
 ) expected(tab,name,signature) loop
  if not exists(select 1 from pg_trigger where tgrelid=to_regclass('public.'||r.tab) and tgname=r.name and tgfoid=to_regprocedure(r.signature) and tgenabled='O' and not tgisinternal) then raise exception 'Reviewed trigger drift: %',r.name; end if;
 end loop;
end $preflight$;
lock table public.class_profiles,public.classes,public.class_staffing_slots,public.scheduled_shifts,public.shifts,public.timesheets,public.invoices,public.schedule_occurrence_exclusions,public.class_activity,public.venues in share row exclusive mode;
create temporary table pg_temp.classes_lifecycle_baseline(table_name text primary key,n bigint,h text) on commit drop;
do $snapshot$
declare t text; n bigint; h text;
begin
 foreach t in array array['class_profiles','classes','class_staffing_slots','scheduled_shifts','shifts','timesheets','invoices','schedule_occurrence_exclusions','class_activity','venues'] loop
  execute format($q$select count(*),md5(coalesce(string_agg(to_jsonb(x)::text,'' order by id),'')) from public.%I x$q$,t) into n,h;
  insert into pg_temp.classes_lifecycle_baseline values(t,n,h);
 end loop;
end $snapshot$;
alter table public.class_profiles add column archive_state jsonb;
-- Legacy imported profiles can have an unbounded start and an inclusive end.
alter table public.class_profiles drop constraint class_profile_dates_valid;
alter table public.class_profiles add constraint class_profile_dates_valid check(start_date is null or end_date is null or end_date>=start_date);
alter table public.classes add column effective_from date,add column effective_to date,add column duration_minutes integer check(duration_minutes between 1 and 1440),
 add constraint classes_effective_dates_valid check(effective_from is null or effective_to is null or effective_to>=effective_from);
drop index public.classes_profile_recurring_session_unique;
create unique index classes_profile_recurring_version_unique on public.classes(class_profile_id,weekday,start_time,coalesce(effective_from,'-infinity'::date)) where active=true;
-- Independent immutable audit: identifiers are values, never cascading foreign keys.
create table public.class_lifecycle_audit(
 id uuid primary key default gen_random_uuid(),club_id uuid not null,class_profile_id uuid,
 actor_id uuid not null,action text not null,request_id uuid not null,payload_hash text not null,
 result jsonb not null,details jsonb not null default '{}',created_at timestamptz not null default now(),unique(club_id,request_id)
);
alter table public.class_lifecycle_audit enable row level security;
create policy class_lifecycle_audit_read on public.class_lifecycle_audit for select to authenticated using(club_id=public.current_club_id() and public.is_club_admin(club_id));
revoke all on public.class_lifecycle_audit from public,anon,authenticated,service_role;
grant select on public.class_lifecycle_audit to authenticated;
-- Classes commands now own management. Legacy clients cannot bypass versioning
-- with partial direct writes. Read access and dated staffing workflows remain.
revoke insert,update,delete,truncate on public.class_profiles,public.classes,public.class_staffing_slots from public,authenticated,anon;

create function public.classes_dependencies(p_profile_id uuid,p_lock boolean default false) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare r record; ids uuid[]; n bigint; result jsonb:='[]';
begin
 -- Discover current AND future references, including nonstandard FK names and
 -- conventional unconstrainted UUID references. Never rely on ON DELETE CASCADE.
 for r in
  select distinct candidate.schema_name,candidate.table_name,candidate.column_name,candidate.target from (
   select ns.nspname schema_name,c.relname table_name,a.attname column_name,
    case a.attname when 'class_profile_id' then 'class_profiles' when 'class_id' then 'classes' when 'staffing_slot_id' then 'class_staffing_slots' end target
   from pg_class c join pg_namespace ns on ns.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
   where ns.nspname='public' and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped and a.atttypid='uuid'::regtype and a.attname in ('class_profile_id','class_id','staffing_slot_id')
   union
   select ns.nspname,src.relname,sa.attname,dst.relname
   from pg_constraint fk join pg_class src on src.oid=fk.conrelid join pg_namespace ns on ns.oid=src.relnamespace
   join pg_class dst on dst.oid=fk.confrelid
   cross join lateral unnest(fk.conkey,fk.confkey) keys(srcnum,dstnum)
   join pg_attribute sa on sa.attrelid=src.oid and sa.attnum=keys.srcnum
   join pg_attribute da on da.attrelid=dst.oid and da.attnum=keys.dstnum
   where fk.contype='f' and dst.oid in ('public.class_profiles'::regclass,'public.classes'::regclass,'public.class_staffing_slots'::regclass,'public.class_activity'::regclass) and da.attname='id'
  ) candidate where not (candidate.schema_name='public' and candidate.table_name in ('class_profiles','classes','class_staffing_slots','class_activity','class_lifecycle_audit'))
  order by candidate.schema_name,candidate.table_name,candidate.column_name,candidate.target
 loop
  if p_lock then execute format('lock table %I.%I in share row exclusive mode',r.schema_name,r.table_name); end if;
  case r.target
   when 'class_profiles' then ids:=array[p_profile_id];
   when 'classes' then select array_agg(id) into ids from public.classes where class_profile_id=p_profile_id;
   when 'class_staffing_slots' then select array_agg(s.id) into ids from public.class_staffing_slots s join public.classes c on c.id=s.class_id where c.class_profile_id=p_profile_id;
   when 'class_activity' then select array_agg(id) into ids from public.class_activity where class_profile_id=p_profile_id;
  end case;
  execute format('select count(*) from %I.%I where %I=any($1)',r.schema_name,r.table_name,r.column_name) into n using coalesce(ids,'{}'::uuid[]);
  if n>0 then result:=result||jsonb_build_array(jsonb_build_object('schema',r.schema_name,'table',r.table_name,'column',r.column_name,'count',n)); end if;
 end loop;
 return result;
end $$;

create function public.classes_deletion_check(p_profile_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.class_profiles%rowtype; blockers jsonb;
begin
 select * into p from public.class_profiles where id=p_profile_id and club_id=public.current_club_id();
 if not found or not public.is_club_admin(p.club_id) then raise exception using errcode='42501',message='Club administrator only'; end if;
 blockers:=public.classes_dependencies(p.id,false);
 return jsonb_build_object('allowed',p.publication_status='draft' and blockers='[]'::jsonb,'blockers',blockers,'reason',case when p.publication_status<>'draft' then 'Only unused Draft classes can be permanently deleted.' when blockers<>'[]'::jsonb then 'This class has protected operational history.' else 'Unused Draft. Its activity will be retained in the independent audit.' end);
end $$;
create or replace function public.classes_phase1_shift_gate() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.class_profiles%rowtype; c public.classes%rowtype; slot public.class_staffing_slots%rowtype;
begin
 if new.class_id is null then
  if new.staffing_slot_id is not null then return null; end if;
  return new; -- Unrelated one-off staffing retains its existing behaviour.
 end if;
 select * into c from public.classes where id=new.class_id;
 if not found then return null; end if;
 -- Serialize every generation/copy INSERT with lifecycle commands on the profile.
 select * into p from public.class_profiles where id=c.class_profile_id for share;
 if not found or not p.active or p.publication_status<>'published' or p.club_id<>new.club_id then return null; end if;
 select * into c from public.classes where id=new.class_id for share;
 if not found or not c.active or c.club_id<>p.club_id or c.class_profile_id<>p.id
 or (p.start_date is not null and new.shift_date<p.start_date) or (p.end_date is not null and new.shift_date>p.end_date)
 or (c.effective_from is not null and new.shift_date<c.effective_from) or (c.effective_to is not null and new.shift_date>c.effective_to)
 or not exists(select 1 from public.venues where id=c.venue_id and club_id=p.club_id and active) then return null; end if;
 if new.staffing_slot_id is not null then
  select * into slot from public.class_staffing_slots where id=new.staffing_slot_id for share;
  if not found or not slot.active or slot.class_id<>c.id then return null; end if;
 end if;
 return new;
end $$;
create or replace function public.apply_class_profile_to_session()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $function$
declare profile public.class_profiles%rowtype;
begin
  select * into profile from public.class_profiles where id=new.class_profile_id;
  if not found then raise exception using errcode='23503',message='Class Profile does not exist'; end if;
  new.club_id:=profile.club_id;
  new.name:=profile.name;
  new.programme:=profile.programme;
  new.session_colour:=profile.session_colour;
  new.capacity:=profile.capacity;
  new.minimum_age:=profile.minimum_age;
  new.maximum_age:=profile.maximum_age;
  new.active:=coalesce(new.active,true) and profile.active;
  new.coaches_required:=greatest(1,profile.lead_coaches_required+profile.assistant_coaches_required);
  new.lead_coaches_required:=profile.lead_coaches_required;
  new.assistant_coaches_required:=profile.assistant_coaches_required;
  new.minimum_coaches:=profile.minimum_coaches;
  new.maximum_coaches:=profile.maximum_coaches;
  new.lead_recommended_qualification_id:=profile.lead_recommended_qualification_id;
  new.assistant_recommended_qualification_id:=profile.assistant_recommended_qualification_id;
  new.warn_if_understaffed:=profile.warn_if_understaffed;
  new.critical_if_no_lead:=profile.critical_if_no_lead;
  new.allow_below_recommended_qualification:=profile.allow_below_recommended_qualification;
  new.finish_time:=(new.start_time+make_interval(mins=>coalesce(new.duration_minutes,profile.session_length_minutes)))::time;
  return new;
end
$function$;
create or replace function public.propagate_class_profile_to_sessions()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $function$
begin
  update public.classes set
    name=new.name,programme=new.programme,session_colour=new.session_colour,
    capacity=new.capacity,minimum_age=new.minimum_age,maximum_age=new.maximum_age,
    coaches_required=greatest(1,new.lead_coaches_required+new.assistant_coaches_required),
    lead_coaches_required=new.lead_coaches_required,
    assistant_coaches_required=new.assistant_coaches_required,
    minimum_coaches=new.minimum_coaches,maximum_coaches=new.maximum_coaches,
    lead_recommended_qualification_id=new.lead_recommended_qualification_id,
    assistant_recommended_qualification_id=new.assistant_recommended_qualification_id,
    warn_if_understaffed=new.warn_if_understaffed,
    critical_if_no_lead=new.critical_if_no_lead,
    allow_below_recommended_qualification=new.allow_below_recommended_qualification,
    updated_at=now()
  where class_profile_id=new.id;
  return new;
end
$function$;
create or replace function public.classes_save_profile(p_data jsonb,p_sessions jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare cid uuid:=public.current_club_id(); rid uuid:=nullif(p_data->>'id','')::uuid; p public.class_profiles%rowtype;
 s jsonb; slot jsonb; coach uuid; sid uuid; keep_ids uuid[]:='{}'; req int:=(p_data->>'required_coaches')::int; duration int:=(p_data->>'session_length_minutes')::int;
 cat uuid:=nullif(p_data->>'category_id','')::uuid; prog uuid:=nullif(p_data->>'programme_id','')::uuid;
begin
 if cid is null or not public.is_club_admin(cid) then raise exception 'Club administrator only'; end if;
 if nullif(btrim(p_data->>'name'),'') is null or coalesce((p_data->>'capacity')::int,0)<1 or duration is null or duration not between 1 and 1440 then raise exception 'Name, capacity and valid duration required'; end if;
 if (p_data->>'minimum_age')::int<0 or (p_data->>'maximum_age')::int<coalesce((p_data->>'minimum_age')::int,0) then raise exception 'Invalid age range'; end if;
 if coalesce((p_data->>'lead_coaches_required')::int,-1)<0 or coalesce((p_data->>'assistant_coaches_required')::int,-1)<0
 or (p_data->>'lead_coaches_required')::int+(p_data->>'assistant_coaches_required')::int is distinct from req
 or coalesce((p_data->>'minimum_coaches')::int,-1)<0 or coalesce((p_data->>'maximum_coaches')::int,13)>12
 or (p_data->>'maximum_coaches')::int is null or (p_data->>'maximum_coaches')::int<(p_data->>'minimum_coaches')::int then raise exception 'Invalid coaching requirements'; end if;
 if coalesce(p_data->>'session_colour','') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid class colour'; end if;
 if exists(select 1 from unnest(array[nullif(p_data->>'lead_recommended_qualification_id','')::uuid,nullif(p_data->>'assistant_recommended_qualification_id','')::uuid]) q(id) where q.id is not null and not exists(select 1 from public.qualification_types t where t.id=q.id and t.club_id=cid)) then raise exception 'Qualification outside club'; end if;
 if req is null or req<1 or req>12 then raise exception 'Required coaches must be 1–12'; end if;
 if cat is not null and not exists(select 1 from public.class_categories where id=cat and club_id=cid) then raise exception 'Category outside club'; end if;
 if prog is not null and not exists(select 1 from public.class_programmes where id=prog and club_id=cid and (category_id is null or category_id is not distinct from cat)) then raise exception 'Programme/category mismatch'; end if;
 if rid is not null then
  select * into p from public.class_profiles where id=rid and club_id=cid for update;
  if not found then raise exception 'Class outside club'; end if;
  if not p.active then raise exception 'Restore an archived class before editing'; end if;
  if p.publication_status='draft' and public.classes_dependencies(p.id,true)<>'[]'::jsonb then raise exception 'Draft has dependent history; direct schedule edits are blocked. Archive it instead.'; end if;
  if p.publication_status='published' and p_sessions is not null then raise exception 'Use Change from date in Classes for published schedule changes'; end if;
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
  category_id=cat,programme_id=prog,programme=case when prog is null then p_data->>'programme' else (select name from public.class_programmes where id=prog and club_id=cid) end,visibility=p_data->>'visibility',
  start_date=nullif(p_data->>'start_date','')::date,end_date=nullif(p_data->>'end_date','')::date,
  description=p_data->>'description',eligibility_description=p_data->>'eligibility_description',
  session_length_minutes=duration,
  session_colour=p_data->>'session_colour',
  lead_coaches_required=(p_data->>'lead_coaches_required')::int,assistant_coaches_required=(p_data->>'assistant_coaches_required')::int,
  minimum_coaches=(p_data->>'minimum_coaches')::int,maximum_coaches=(p_data->>'maximum_coaches')::int,
  lead_recommended_qualification_id=nullif(p_data->>'lead_recommended_qualification_id','')::uuid,
  assistant_recommended_qualification_id=nullif(p_data->>'assistant_recommended_qualification_id','')::uuid,
  warn_if_understaffed=coalesce((p_data->>'warn_if_understaffed')::boolean,true),critical_if_no_lead=coalesce((p_data->>'critical_if_no_lead')::boolean,true),
  allow_below_recommended_qualification=coalesce((p_data->>'allow_below_recommended_qualification')::boolean,true),updated_at=now()
 where id=rid;
 if p.publication_status='draft' then
  if nullif(p_data->>'start_date','') is null then raise exception 'Draft start date required'; end if;
  if p_sessions is null or jsonb_typeof(p_sessions)<>'array' or jsonb_array_length(p_sessions)<1 then raise exception 'Add at least one recurring session'; end if;
  if exists(select 1 from jsonb_array_elements(p_sessions) v group by (v->>'weekday')::int,(v->>'start_time')::time having count(*)>1) then raise exception 'Recurring day and time must be unique'; end if;
  for s in select value from jsonb_array_elements(p_sessions) loop
   if (s->>'weekday')::int not between 0 and 6 then raise exception 'Invalid weekday'; end if;
   if s->>'start_time' is null or s->>'weekday' is null or coalesce((s->>'break_minutes')::int,0)<0 or coalesce((s->>'break_minutes')::int,0)>=duration then raise exception 'Valid start, weekday and break shorter than duration required'; end if;
   if not exists(select 1 from public.venues where id=(s->>'venue_id')::uuid and club_id=cid and active) then raise exception 'Select an active venue in this club'; end if;
   sid:=nullif(s->>'id','')::uuid;
   if sid is null then
    insert into public.classes(class_profile_id,venue_id,weekday,start_time,break_minutes,notes)
     values(rid,(s->>'venue_id')::uuid,(s->>'weekday')::int,(s->>'start_time')::time,coalesce((s->>'break_minutes')::int,0),s->>'notes') returning id into sid;
   else
    update public.classes set venue_id=(s->>'venue_id')::uuid,weekday=(s->>'weekday')::int,start_time=(s->>'start_time')::time,
     break_minutes=coalesce((s->>'break_minutes')::int,0),notes=s->>'notes',active=true where id=sid and class_profile_id=rid;
    if not found then raise exception 'Session outside class'; end if;
   end if;
   if s ? 'staffing' and jsonb_typeof(s->'staffing')<>'array' then raise exception 'Staffing must be an array'; end if;
   if exists(select 1 from jsonb_array_elements(coalesce(s->'staffing','[]')) v group by (v->>'slot_number')::int having count(*)>1) then raise exception 'Duplicate staffing position'; end if;
   for slot in select value from jsonb_array_elements(coalesce(s->'staffing','[]')) loop
    if coalesce((slot->>'slot_number')::int,0)<1 then raise exception 'Invalid staffing position'; end if;
    -- Reduced positions remain stored inactive, preserving defaults and history.
    if (slot->>'slot_number')::int>req then continue; end if;
    coach:=nullif(slot->>'default_profile_id','')::uuid;
    if coach is not null and not exists(select 1 from public.profiles where id=coach and club_id=cid and is_active) then raise exception 'Select an active coach in this club'; end if;
    if coalesce(slot->>'payment_type','standard') not in ('standard','enhanced','volunteer') then raise exception 'Invalid payment preference'; end if;
    insert into public.class_staffing_slots(class_id,slot_number,default_profile_id,default_payment_type,active)
     values(sid,(slot->>'slot_number')::int,coach,coalesce(slot->>'payment_type','standard'),true)
     on conflict(class_id,slot_number) do update set default_profile_id=excluded.default_profile_id,default_payment_type=excluded.default_payment_type,active=true;
   end loop;
   keep_ids:=array_append(keep_ids,sid);
  end loop;
  -- Draft recurrences are retired, never deleted. They have no generated staffing.
  update public.classes set active=false where class_profile_id=rid and not(id=any(keep_ids)) and active;
 end if;
 if p.publication_status='published' then
  for s in select value from jsonb_array_elements(coalesce(p_data->'session_notes','[]')) loop
   update public.classes set notes=s->>'notes' where id=(s->>'id')::uuid and class_profile_id=rid and club_id=cid;
   if not found then raise exception 'Session notes outside class'; end if;
  end loop;
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
create or replace function public.classes_calendar_data(p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare cid uuid:=public.current_club_id(); result jsonb;
begin
 if cid is null or not public.is_club_admin(cid) then raise exception 'Club administrator only'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>42 then raise exception 'Calendar range must be at most 43 days'; end if;
 select jsonb_build_object(
 'creation_version',2,'lifecycle_version',3,
 'coaches',coalesce((select jsonb_agg(jsonb_build_object('id',id,'full_name',full_name) order by full_name) from public.profiles where club_id=cid and is_active),'[]'),
 'qualifications',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.qualification_types where club_id=cid and active),'[]'),
 'profiles',coalesce((select jsonb_agg(to_jsonb(p)) from public.class_profiles p where club_id=cid),'[]'),
 'sessions',coalesce((select jsonb_agg(to_jsonb(c)) from public.classes c where club_id=cid),'[]'),
 'categories',coalesce((select jsonb_agg(to_jsonb(c) order by display_order,name) from public.class_categories c where club_id=cid),'[]'),
 'programmes',coalesce((select jsonb_agg(to_jsonb(p) order by name) from public.class_programmes p where club_id=cid),'[]'),
 'venues',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active)) from public.venues where club_id=cid),'[]'),
 'slots',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'class_id',s.class_id,'slot_number',s.slot_number,'active',s.active,'coach_name',p.full_name,'default_profile_id',s.default_profile_id,'payment_type',s.default_payment_type)) from public.class_staffing_slots s join public.classes c on c.id=s.class_id left join public.profiles p on p.id=s.default_profile_id where c.club_id=cid),'[]'),
 'shifts',coalesce((select jsonb_agg(jsonb_build_object('class_id',class_id,'staffing_slot_id',staffing_slot_id,'shift_date',shift_date,'status',status,'assigned',profile_id is not null,'start_time',start_time,'finish_time',finish_time,'venue_id',venue_id)) from public.scheduled_shifts where club_id=cid and shift_date between p_from and p_to),'[]'),
 'exclusions',coalesce((select jsonb_agg(jsonb_build_object('class_id',e.class_id,'staffing_slot_id',e.staffing_slot_id,'shift_date',e.shift_date)) from public.schedule_occurrence_exclusions e join public.classes c on c.id=e.class_id where c.club_id=cid and e.shift_date between p_from and p_to),'[]'),
 'activity',coalesce((select jsonb_agg(x) from (select class_profile_id,action,created_at from public.class_activity where club_id=cid order by created_at desc limit 200) x),'[]')
 ) into result;
 return result;
end $$;
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
      and v.club_id = actor_club and v.active and classes.club_id = actor_club
      and exists (select 1 from public.class_profiles p where p.id=classes.class_profile_id and p.club_id=actor_club and p.active and p.publication_status='published')
  loop
    for d in
      select generate_series(
        p_month_start,
        month_end,
        interval '1 day'
      )::date
    loop
      if extract(dow from d)::integer = c.weekday and (c.effective_from is null or d>=c.effective_from) and (c.effective_to is null or d<=c.effective_to) and exists (select 1 from public.class_profiles p where p.id=c.class_profile_id and (p.start_date is null or d>=p.start_date) and (p.end_date is null or d<=p.end_date)) then
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
create or replace function public.classes_publish(p_profile_id uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.class_profiles%rowtype;
begin
 select * into p from public.class_profiles where id=p_profile_id and club_id=public.current_club_id() for update;
 if not found or not public.is_club_admin(p.club_id) then raise exception 'Club administrator only'; end if;
 if p.publication_status='published' then return; end if;
 if p.end_date is not null and p.end_date<(now() at time zone 'Europe/London')::date then raise exception 'An ended Draft cannot be published'; end if;
 if not p.active or p.start_date is null or p.capacity<1 or not exists(select 1 from public.classes where class_profile_id=p.id and active) then raise exception 'Active class, start date, capacity and recurrence required'; end if;
 if exists(select 1 from public.classes c where c.class_profile_id=p.id and c.active and
  (not exists(select 1 from public.venues v where v.id=c.venue_id and v.club_id=p.club_id and v.active) or
   not exists(select 1 from public.class_staffing_slots s where s.class_id=c.id and s.active))) then raise exception 'Every session needs an active venue and staffing requirements'; end if;
 update public.class_profiles set publication_status='published',published_at=now(),published_by=auth.uid() where id=p.id;
 insert into public.class_activity(club_id,class_profile_id,action) values(p.club_id,p.id,'Published to Master Timetable');
end $$;
create function public.classes_command(p_action text,p_profile_id uuid,p_data jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare cid uuid:=public.current_club_id(); p public.class_profiles%rowtype; receipt public.class_lifecycle_audit%rowtype;
 rid uuid:=p_profile_id; digest text; result jsonb; details jsonb:='{}'; deps jsonb; cutoff date; final_date date;
 s jsonb; old_session public.classes%rowtype; sid uuid; duration integer; snapshot jsonb; actor_today date:=(now() at time zone 'Europe/London')::date;
begin
 if cid is null or not public.is_club_admin(cid) or auth.uid() is null then raise exception using errcode='42501',message='Club administrator only'; end if;
 if p_request_id is null or p_data is null or jsonb_typeof(p_data)<>'object' or p_action not in ('save','publish','end','archive','restore','delete','change') or p_action is null then raise exception 'Invalid class command'; end if;
 perform set_config('lock_timeout','2s',true);
 perform set_config('statement_timeout','60s',true);
 digest:=md5(jsonb_build_object('action',p_action,'id',p_profile_id,'data',p_data)::text);
 perform pg_advisory_xact_lock(hashtextextended(cid::text||p_request_id::text,0));
 select * into receipt from public.class_lifecycle_audit where club_id=cid and request_id=p_request_id;
 if found then
  if receipt.payload_hash<>digest or receipt.actor_id<>auth.uid() then raise exception 'Request identifier was already used for a different command'; end if;
  return receipt.result;
 end if;
 if p_profile_id is not null then
  select * into p from public.class_profiles where id=p_profile_id and club_id=cid for update;
  if not found then raise exception using errcode='42501',message='Class outside club'; end if;
  perform 1 from public.classes where class_profile_id=p.id order by id for update;
  perform 1 from public.class_staffing_slots where class_id in(select id from public.classes where class_profile_id=p.id) order by id for update;
 elsif p_action<>'save' then raise exception 'Class required'; end if;

 if p_action='save' then
  rid:=public.classes_save_profile((p_data->'profile')||jsonb_build_object('id',p_profile_id),nullif(p_data->'sessions','null'::jsonb));
 elsif p_action='publish' then
  perform public.classes_publish(p.id);
 elsif p_action='end' then
  final_date:=nullif(p_data->>'final_date','')::date;
  if not p.active or p.publication_status<>'published' or final_date is null or (p.start_date is not null and final_date<p.start_date) then raise exception 'Choose a valid inclusive final date for an active published class'; end if;
  if p.end_date is not null and final_date>p.end_date then raise exception 'Extending an ended class requires Change from date'; end if;
  update public.class_profiles set end_date=final_date,updated_at=now() where id=p.id;
  insert into public.class_activity(club_id,class_profile_id,action) values(cid,p.id,'Ended after '||final_date);
 elsif p_action='archive' then
  -- Also repairs a legacy inactive profile with active child recurrences.
  snapshot:=p.archive_state;
  if snapshot is null then
   select jsonb_build_object('sessions',coalesce((select jsonb_agg(id) from public.classes where class_profile_id=p.id and active),'[]'),
    'slots',coalesce((select jsonb_agg(s.id) from public.class_staffing_slots s join public.classes c on c.id=s.class_id where c.class_profile_id=p.id and c.active and s.active),'[]')) into snapshot;
  end if;
  update public.class_profiles set active=false,archive_state=snapshot,updated_at=now() where id=p.id;
  update public.classes set active=false where class_profile_id=p.id and active;
  update public.class_staffing_slots set active=false where class_id in(select id from public.classes where class_profile_id=p.id) and active;
  insert into public.class_activity(club_id,class_profile_id,action) values(cid,p.id,'Archived');
 elsif p_action='restore' then
  if p.active or p.archive_state is null or jsonb_array_length(p.archive_state->'sessions')=0 then raise exception 'No safe archive snapshot exists. Keep this legacy archive and create a reviewed Draft instead.'; end if;
  if exists(select 1 from public.classes c where c.class_profile_id=p.id and c.id in(select value::uuid from jsonb_array_elements_text(p.archive_state->'sessions')) and not exists(select 1 from public.venues v where v.id=c.venue_id and v.club_id=cid and v.active)) then raise exception 'Restore requires active venues in this club'; end if;
  update public.class_profiles set active=true,archive_state=null,updated_at=now() where id=p.id;
  update public.classes set active=true where class_profile_id=p.id and id in(select value::uuid from jsonb_array_elements_text(p.archive_state->'sessions'));
  update public.class_staffing_slots set active=true where class_id in(select id from public.classes where class_profile_id=p.id and active) and id in(select value::uuid from jsonb_array_elements_text(p.archive_state->'slots'));
  insert into public.class_activity(club_id,class_profile_id,action) values(cid,p.id,'Restored');
 elsif p_action='delete' then
  if p.publication_status<>'draft' or p_data->>'confirmation' is distinct from p.name then raise exception 'Only unused Drafts can be deleted; type the exact class name'; end if;
  perform 1 from public.class_activity where class_profile_id=p.id for update;
  deps:=public.classes_dependencies(p.id,true);
  if deps<>'[]'::jsonb then raise exception 'Protected dependencies: %. End or Archive this class instead.',deps; end if;
  -- Preserve activity and identifiers as an immutable, non-dependent audit snapshot.
  select jsonb_build_object('profile',to_jsonb(p),'sessions',coalesce((select jsonb_agg(to_jsonb(c)) from public.classes c where class_profile_id=p.id),'[]'),
   'slots',coalesce((select jsonb_agg(to_jsonb(s)) from public.class_staffing_slots s join public.classes c on c.id=s.class_id where c.class_profile_id=p.id),'[]'),
   'activity',coalesce((select jsonb_agg(to_jsonb(a)) from public.class_activity a where class_profile_id=p.id),'[]')) into details;
  delete from public.class_activity where class_profile_id=p.id;
  delete from public.class_staffing_slots where class_id in(select id from public.classes where class_profile_id=p.id);
  delete from public.classes where class_profile_id=p.id;
  delete from public.class_profiles where id=p.id;
 elsif p_action='change' then
  cutoff:=nullif(p_data->>'effective_date','')::date;
  final_date:=nullif(p_data->>'end_date','')::date;
  if not p.active or p.publication_status<>'published' or cutoff is null or cutoff<=actor_today or (final_date is not null and final_date<cutoff) then raise exception 'Choose a future effective date within the class operating range and a valid final date'; end if;
  if jsonb_typeof(p_data->'sessions') is distinct from 'array' or jsonb_array_length(p_data->'sessions')<1 then raise exception 'At least one replacement session is required'; end if;
  -- Locks discovered reference tables as well as aggregate rows. New operational
  -- inserts must finish before these fresh checks, or wait for the version change.
  deps:=public.classes_dependencies(p.id,true);
  if exists(select 1 from jsonb_array_elements(deps) d where d->>'schema'<>'public' or d->>'table' not in ('scheduled_shifts','schedule_occurrence_exclusions','coaching_assignment_history')) then raise exception 'Additional operational references require a reviewed effective-date workflow: %',deps; end if;
  if exists(select 1 from public.scheduled_shifts s where (s.class_id in(select id from public.classes where class_profile_id=p.id) or s.staffing_slot_id in(select x.id from public.class_staffing_slots x join public.classes c on c.id=x.class_id where c.class_profile_id=p.id)) and s.shift_date>=cutoff)
  or exists(select 1 from public.schedule_occurrence_exclusions e join public.classes c on c.id=e.class_id where c.class_profile_id=p.id and e.shift_date>=cutoff)
  or exists(select 1 from public.coaching_assignment_history h where (h.class_id in(select id from public.classes where class_profile_id=p.id) or h.staffing_slot_id in(select x.id from public.class_staffing_slots x join public.classes c on c.id=x.class_id where c.class_profile_id=p.id)) and h.shift_date>=cutoff) then raise exception 'Generated work or occurrence history exists on/after this date. Choose a later date; no existing records will be rewritten.'; end if;
  if exists(select 1 from public.classes where class_profile_id=p.id and active and effective_from>=cutoff) then raise exception 'Choose a date after existing planned recurrence versions'; end if;
  if exists(select 1 from jsonb_array_elements(p_data->'sessions') v group by (v->>'weekday')::int,(v->>'start_time')::time having count(*)>1) then raise exception 'Replacement weekday and start time must be unique'; end if;
  -- Freeze old bounds before changing the aggregate's inclusive final date.
  -- Do not alter the old weekday/time/venue/duration/default coach or slot IDs.
  update public.classes set active=false where class_profile_id=p.id and active and coalesce(effective_from,p.start_date)>least(coalesce(p.end_date,'infinity'::date),cutoff-1);
  update public.classes set effective_from=coalesce(effective_from,p.start_date),effective_to=least(coalesce(effective_to,'infinity'::date),coalesce(p.end_date,'infinity'::date),cutoff-1)
   where class_profile_id=p.id and active and (effective_to is null or effective_to>=cutoff);
  update public.class_profiles set start_date=case when p.start_date is null then null else least(p.start_date,cutoff) end,end_date=final_date,updated_at=now() where id=p.id;
  if p.lead_coaches_required+p.assistant_coaches_required not between 1 and 12 then raise exception 'Review the staffing requirements before changing the schedule'; end if;
  for s in select value from jsonb_array_elements(p_data->'sessions') loop
   duration:=(s->>'duration_minutes')::int;
   if duration is null or duration not between 1 and 1440 or (s->>'weekday') is null or (s->>'weekday')::int not between 0 and 6 or nullif(s->>'start_time','') is null
    or coalesce((s->>'break_minutes')::int,0)<0 or coalesce((s->>'break_minutes')::int,0)>=duration then raise exception 'Invalid replacement weekday, time, duration or break'; end if;
   if not exists(select 1 from public.venues where id=(s->>'venue_id')::uuid and club_id=cid and active) then raise exception 'Select an active venue in this club'; end if;
   old_session:=null;
   if nullif(s->>'id','') is not null then
    select * into old_session from public.classes where id=(s->>'id')::uuid and class_profile_id=p.id and club_id=cid;
    if not found then raise exception using errcode='42501',message='Replacement source outside class'; end if;
   end if;
   insert into public.classes(class_profile_id,venue_id,weekday,start_time,break_minutes,notes,active,effective_from,effective_to,duration_minutes)
    values(p.id,(s->>'venue_id')::uuid,(s->>'weekday')::int,(s->>'start_time')::time,coalesce((s->>'break_minutes')::int,0),s->>'notes',true,cutoff,final_date,duration) returning id into sid;
   insert into public.class_staffing_slots(class_id,slot_number,default_profile_id,default_payment_type,active)
    select sid,n,old.default_profile_id,coalesce(old.default_payment_type,'standard'),true from generate_series(1,p.lead_coaches_required+p.assistant_coaches_required) n
     left join public.class_staffing_slots old on old.class_id=old_session.id and old.slot_number=n and old.active;
  end loop;
  insert into public.class_activity(club_id,class_profile_id,action) values(cid,p.id,'Schedule changed from '||cutoff);
 end if;
 result:=jsonb_build_object('id',rid,'sessions',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('staffing',coalesce((select jsonb_agg(jsonb_build_object('slot_number',s.slot_number,'default_profile_id',s.default_profile_id,'payment_type',s.default_payment_type)) from public.class_staffing_slots s where s.class_id=c.id and s.active),'[]'))) from public.classes c where c.class_profile_id=rid and c.active),'[]'));

 insert into public.class_lifecycle_audit(club_id,class_profile_id,actor_id,action,request_id,payload_hash,result,details)
  values(cid,rid,auth.uid(),p_action,p_request_id,digest,result,details);
 return result;
end $$;

-- Old archive entry points use the same atomic lifecycle. Old deletion has no
-- exact-name parameter and must fail closed rather than bypass confirmation.
create or replace function public.set_class_profile_active(p_profile_id uuid,p_active boolean) returns void language plpgsql security definer set search_path=pg_catalog,public as $function$
begin
 if p_active is null then raise exception 'Choose Archive or Restore'; end if;
 perform public.classes_command(case when p_active then 'restore' else 'archive' end,p_profile_id,'{}',gen_random_uuid());
end
$function$;
create or replace function public.delete_class_profile_if_unused(p_profile_id uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $function$
begin
 raise exception 'Use Permanently delete in Classes with exact class-name confirmation';
end
$function$;

revoke all on function public.classes_dependencies(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.classes_save_profile(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.classes_publish(uuid) from public,anon,authenticated,service_role;
revoke all on function public.classes_phase1_shift_gate() from public,anon,authenticated,service_role;
revoke all on function public.apply_class_profile_to_session() from public,anon,authenticated,service_role;
revoke all on function public.propagate_class_profile_to_sessions() from public,anon,authenticated,service_role;
revoke all on function public.classes_command(text,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.classes_command(text,uuid,jsonb,uuid) to authenticated;
revoke all on function public.classes_deletion_check(uuid) from public,anon,authenticated;
grant execute on function public.classes_deletion_check(uuid) to authenticated;
revoke all on function public.classes_calendar_data(date,date) from public,anon,authenticated;
grant execute on function public.classes_calendar_data(date,date) to authenticated;
revoke all on function public.generate_schedule_month(date) from public,anon,authenticated;
grant execute on function public.generate_schedule_month(date) to authenticated;
revoke all on function public.set_class_profile_active(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_class_profile_active(uuid,boolean) to authenticated;
revoke all on function public.delete_class_profile_if_unused(uuid) from public,anon,authenticated;
grant execute on function public.delete_class_profile_if_unused(uuid) to authenticated;

do $verify$
declare b record; n bigint; h text; expr text;
begin
 if to_regclass('pg_temp.classes_lifecycle_baseline') is null then raise exception 'Operational baseline missing; rolling back'; end if;
 if (select count(*) from pg_temp.classes_lifecycle_baseline)<>10 then raise exception 'Operational baseline incomplete; rolling back'; end if;
 for b in select * from pg_temp.classes_lifecycle_baseline loop
  expr:='to_jsonb(x)';
  if b.table_name='class_profiles' then expr:=expr||' - ''archive_state'''; end if;
  if b.table_name='classes' then expr:=expr||' - array[''effective_from'',''effective_to'',''duration_minutes'']'; end if;
  execute format($q$select count(*),md5(coalesce(string_agg((%s)::text,'' order by id),'')) from public.%I x$q$,expr,b.table_name) into n,h;
  if n is distinct from b.n or h is distinct from b.h then raise exception 'Operational records changed in %; rolling back',b.table_name; end if;
 end loop;
 if exists(select 1 from unnest(array['class_profiles','classes','class_staffing_slots']) t(name) where has_table_privilege('authenticated','public.'||t.name,'INSERT,UPDATE,DELETE,TRUNCATE') or has_any_column_privilege('authenticated','public.'||t.name,'INSERT,UPDATE')) then raise exception 'Direct class mutation privilege remains'; end if;
 if exists(select 1 from public.class_lifecycle_audit) then raise exception 'Unexpected audit data during migration'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.scheduled_shifts'::regclass and tgname='classes_phase1_shift_gate' and tgenabled='O') then raise exception 'Lifecycle insertion gate missing'; end if;
end $verify$;
end $classes_lifecycle_migration$;
commit;
