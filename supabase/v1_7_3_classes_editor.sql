-- PREPARED, NOT RUN. Forward only after v1_7_2. Review and apply manually.
-- No data repair or scheduling generation. Existing migrations stay unchanged.
begin;
set local lock_timeout='2s';
set local statement_timeout='60s';
do $classes_editor_migration$
declare f record;
begin
 for f in select * from (values
 ('public.classes_save_profile(jsonb,jsonb)','8f7d0b8435ed4082ff1c89f8c4250ceb'),
 ('public.classes_calendar_data(date,date)','93eb0b33b09cade2926db883c7b1be4f'),
 ('public.classes_command(text,uuid,jsonb,uuid)','5f18892209c305a462f0bbf28884228a'),
 ('public.propagate_class_profile_to_sessions()','efc9929c97b0f11b8b51ca8901c66e7e'),
 ('public.apply_class_profile_to_session()','e324ee176a731ccb13a856ee5c829280')
 ) reviewed(signature,body_md5) loop
  if to_regprocedure(f.signature) is null or (select md5(prosrc) from pg_proc where oid=to_regprocedure(f.signature)) is distinct from f.body_md5 then raise exception 'Reviewed function drift: %',f.signature; end if;
 end loop;
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
  if p.publication_status='published' and exists(select 1 from jsonb_object_keys(p_data) k where k not in
   ('id','name','capacity','minimum_age','maximum_age','category_id','programme_id','programme','visibility','start_date','end_date','description','eligibility_description','session_length_minutes','session_colour','lead_coaches_required','assistant_coaches_required','minimum_coaches','maximum_coaches','required_coaches','lead_recommended_qualification_id','assistant_recommended_qualification_id','warn_if_understaffed','critical_if_no_lead','allow_below_recommended_qualification','session_notes','session_defaults',
    'active','publication_status','published_at','published_by','archive_state','club_id','created_at','updated_at')) then
   raise exception 'Protected or unknown profile field; use Change from date for schedule changes';
  end if;
  -- Legacy clients may echo lifecycle metadata; it is never used for writes.
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
   if jsonb_typeof(s)<>'object' or exists(select 1 from jsonb_object_keys(s) k where k not in ('id','notes')) then raise exception 'Only recurrence notes are accepted in metadata updates'; end if;
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
 -- Only existing positions belonging to this locked aggregate may change defaults.
 -- This changes the template, never an already generated staff assignment.
 if p.publication_status='published' and p_data ? 'session_defaults' then
  if jsonb_typeof(p_data->'session_defaults') is distinct from 'array' then raise exception 'Session defaults must be an array'; end if;
  for s in select value from jsonb_array_elements(p_data->'session_defaults') loop
   if jsonb_typeof(s)<>'object' or exists(select 1 from jsonb_object_keys(s) k where k not in ('id','staffing')) then raise exception 'Protected recurrence fields are not accepted in metadata updates'; end if;
   sid:=nullif(s->>'id','')::uuid;
   if not exists(select 1 from public.classes where id=sid and class_profile_id=rid and club_id=cid and active) then raise exception 'Staffing recurrence outside active class'; end if;
   if jsonb_typeof(s->'staffing') is distinct from 'array' then raise exception 'Staffing must be an array'; end if;
   if exists(select 1 from jsonb_array_elements(s->'staffing') v group by (v->>'slot_number')::int having count(*)>1) then raise exception 'Duplicate staffing position'; end if;
   for slot in select value from jsonb_array_elements(s->'staffing') loop
    if jsonb_typeof(slot)<>'object' or exists(select 1 from jsonb_object_keys(slot) k where k not in ('slot_number','default_profile_id','payment_type')) then raise exception 'Only coach and payment defaults may change'; end if;
    if not exists(select 1 from public.class_staffing_slots where class_id=sid and slot_number=(slot->>'slot_number')::int) then raise exception 'Staffing position outside class'; end if;
    coach:=nullif(slot->>'default_profile_id','')::uuid;
    -- Retain an existing inactive coach, but do not permit assigning a new one.
    if coach is not null and not exists(select 1 from public.profiles where id=coach and club_id=cid and (is_active or exists(select 1 from public.class_staffing_slots where class_id=sid and slot_number=(slot->>'slot_number')::int and default_profile_id=coach))) then raise exception 'Select an active coach in this club'; end if;
    if coalesce(slot->>'payment_type','') not in ('standard','enhanced','volunteer') then raise exception 'Invalid payment preference'; end if;
    update public.class_staffing_slots set default_profile_id=coach,default_payment_type=slot->>'payment_type'
     where class_id=sid and slot_number=(slot->>'slot_number')::int;
   end loop;
  end loop;
 end if;
 insert into public.class_activity(club_id,class_profile_id,action) values(cid,rid,case when p_data->>'id' is null then 'Draft created' else 'Class details saved' end);
 return rid;
end $$;
create or replace function public.classes_calendar_data(p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare cid uuid:=public.current_club_id(); result jsonb;
begin
 if cid is null or not public.is_club_admin(cid) then raise exception 'Club administrator only'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>42 then raise exception 'Calendar range must be at most 43 days'; end if;
 select jsonb_build_object(
 'creation_version',2,'lifecycle_version',3,'editing_version',1,
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

revoke all on function public.classes_save_profile(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.classes_calendar_data(date,date) from public,anon,authenticated;
grant execute on function public.classes_calendar_data(date,date) to authenticated;
end $classes_editor_migration$;
commit;
