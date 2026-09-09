-- Members Phase 2. Forward only; no historical row updates or Auth user mutations.
begin;
set local lock_timeout='5s';
alter table public.member_contacts add column first_name text, add column last_name text;
alter table public.member_athletes add column first_name text, add column last_name text,
 add column gender text, add column journey_status text
 check(journey_status in ('enquiry','trial','waiting_list','active','paused','former'));
alter table public.member_families add column primary_contact_id uuid;
alter table public.member_families add constraint member_family_primary_contact_fk
 foreign key(club_id,id,primary_contact_id) references public.member_contacts(club_id,family_id,id) on delete restrict;
create index member_contacts_email_lookup on public.member_contacts(club_id,lower(btrim(email)));
create index member_athletes_identity_lookup on public.member_athletes(club_id,lower(btrim(display_name)),date_of_birth);
create function public.member_phone_key(p_value text) returns text language sql immutable set search_path=pg_catalog as $fn$
 select case when length(d)=12 and left(d,2)='44' then '0'||substr(d,3) else d end
 from (select regexp_replace(regexp_replace(coalesce(p_value,''),'[^0-9]','','g'),'^0044','44') d) s;
$fn$;
create index member_contacts_phone_lookup on public.member_contacts(club_id,public.member_phone_key(phone));

create function public.member_management_club() returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $fn$
declare result uuid;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Authentication required'; end if;
 select p.club_id into result from public.profiles p join public.clubs c on c.id=p.club_id
 where p.id=auth.uid() and p.is_active and c.active and p.role in ('club_owner','org_admin');
 if result is null then raise exception using errcode='42501',message='Member management is not authorised'; end if;
 return result;
end
$fn$;

create function public.member_validate_draft(p_kind text,p_data jsonb) returns void language plpgsql set search_path=pg_catalog,public as $fn$
declare allowed text[]; born date;
begin
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception using errcode='22023',message='Invalid member details'; end if;
 allowed:=case p_kind when 'family' then array['display_name','status']
 when 'contact' then array['first_name','last_name','email','phone','relationship','is_primary','is_emergency','athlete_ids']
 when 'athlete' then array['first_name','last_name','date_of_birth','gender','journey_status'] else null end;
 if allowed is null or exists(select 1 from jsonb_object_keys(p_data) k where not(k=any(allowed))) then raise exception using errcode='22023',message='Unsupported member fields'; end if;
 if p_kind='family' then
  if coalesce(length(btrim(p_data->>'display_name')),0) not between 1 and 200 or coalesce(p_data->>'status','') not in ('active','archived') then raise exception using errcode='22023',message='Invalid family name or status'; end if;
 else
  if coalesce(length(btrim(p_data->>'first_name')),0) not between 1 and 90 or coalesce(length(btrim(p_data->>'last_name')),0) not between 1 and 90 then raise exception using errcode='22023',message='First and last names are required'; end if;
 end if;
 if p_kind='contact' then
  if length(coalesce(p_data->>'email',''))>254 or (coalesce(p_data->>'email','')<>'' and btrim(p_data->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
   or length(coalesce(p_data->>'phone',''))>40 or (coalesce(p_data->>'phone','')<>'' and length(public.member_phone_key(p_data->>'phone')) not between 7 and 15)
   or coalesce(p_data->>'relationship','') not in ('parent','guardian','self','other')
   or jsonb_typeof(p_data->'is_primary') is distinct from 'boolean' or jsonb_typeof(p_data->'is_emergency') is distinct from 'boolean'
   or jsonb_typeof(p_data->'athlete_ids') is distinct from 'array' then raise exception using errcode='22023',message='Invalid contact details'; end if;
 end if;
 if p_kind='athlete' then
  begin born:=(p_data->>'date_of_birth')::date; exception when others then raise exception using errcode='22023',message='Invalid date of birth'; end;
  if born is null or born>current_date or born<date '1900-01-01' or coalesce(p_data->>'journey_status','') not in ('enquiry','trial','waiting_list','active','paused','former')
   or length(coalesce(p_data->>'gender',''))>80 then raise exception using errcode='22023',message='Invalid athlete details'; end if;
 end if;
end
$fn$;

create function public.member_directory(p_search text default '',p_offset integer default 0,p_family_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $fn$
declare tenant uuid; result jsonb; needle text;
begin
 tenant:=public.member_management_club();
 needle:=lower(btrim(coalesce(p_search,'')));
 if length(needle)>100 or p_offset is null or p_offset<0 then raise exception using errcode='22023',message='Invalid search'; end if;
 with matching as (
 select f.* from public.member_families f where f.club_id=tenant and (p_family_id is null or f.id=p_family_id)
 and (needle='' or strpos(lower(f.display_name),needle)>0
 or exists(select 1 from public.member_contacts c where c.club_id=tenant and c.family_id=f.id and
  (strpos(lower(c.display_name),needle)>0 or strpos(lower(coalesce(c.email,'')),needle)>0 or strpos(lower(coalesce(c.phone,'')),needle)>0
    or (length(public.member_phone_key(needle))>=3 and strpos(public.member_phone_key(c.phone),public.member_phone_key(needle))>0)))
 or exists(select 1 from public.member_athletes a where a.club_id=tenant and a.family_id=f.id and strpos(lower(a.display_name),needle)>0))
 ), page as(select * from matching order by display_name,id limit 25 offset p_offset)
 select jsonb_build_object(
 'family_count',(select count(*) from public.member_families where club_id=tenant),
 'athlete_count',(select count(*) from public.member_athletes where club_id=tenant),
 'matched_families',(select count(*) from matching),
 'families',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'display_name',f.display_name,'status',f.status,'updated_at',f.updated_at,'primary_contact_id',f.primary_contact_id,
 'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'display_name',c.display_name,'first_name',c.first_name,'last_name',c.last_name,'email',c.email,'phone',c.phone,'status',c.status,'updated_at',c.updated_at) order by c.display_name,c.id) from public.member_contacts c where c.club_id=tenant and c.family_id=f.id),'[]'::jsonb),
 'athletes',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'display_name',a.display_name,'first_name',a.first_name,'last_name',a.last_name,'date_of_birth',a.date_of_birth,'gender',a.gender,'journey_status',coalesce(a.journey_status,'active'),'status',a.status,'updated_at',a.updated_at) order by a.display_name,a.id) from public.member_athletes a where a.club_id=tenant and a.family_id=f.id),'[]'::jsonb),
 'relationships',coalesce((select jsonb_agg(jsonb_build_object('athlete_id',r.athlete_id,'contact_id',r.contact_id,'relationship',r.relationship,'is_primary',r.is_primary,'is_emergency',r.is_emergency,'status',r.status)) from public.member_athlete_contacts r join public.member_athletes a on a.id=r.athlete_id and a.club_id=r.club_id where r.club_id=tenant and a.family_id=f.id),'[]'::jsonb)
 ) order by f.display_name,f.id) from page f),'[]'::jsonb)) into result;
 return result;
end
$fn$;

create function public.member_manage(p_action text,p_family_id uuid,p_record_id uuid,p_expected_updated_at timestamptz,p_data jsonb,p_ack_duplicates boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $fn$
declare tenant uuid; f public.member_families%rowtype; c public.member_contacts%rowtype; a public.member_athletes%rowtype;
 d jsonb; entry jsonb; warnings text[]:=array[]::text[]; fid uuid; cid uuid; aid uuid; linked uuid; current_stamp timestamptz; chosen uuid[];
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Authentication required'; end if;
 -- Serialise member writes within one club, including duplicate checks and first creation.
 select p.club_id into tenant from public.profiles p join public.clubs cl on cl.id=p.club_id
 where p.id=auth.uid() and p.is_active and cl.active and p.role in ('club_owner','org_admin')
 for share of p for update of cl;
 if tenant is null then raise exception using errcode='42501',message='Member management is not authorised'; end if;
 if p_action is null or p_action not in ('create_family','save_family','save_contact','save_athlete','set_status') then raise exception using errcode='22023',message='Invalid action'; end if;
 if p_action='create_family' then
  if p_family_id is not null or p_record_id is not null or jsonb_typeof(p_data) is distinct from 'object'
   or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('family','contact','athletes')) then raise exception using errcode='22023',message='Invalid creation request'; end if;
  perform public.member_validate_draft('family',p_data->'family');
  perform public.member_validate_draft('contact',p_data->'contact');
  if jsonb_typeof(p_data->'athletes') is distinct from 'array' then raise exception using errcode='22023',message='Athletes are required'; end if;
  if jsonb_array_length(p_data->'athletes') not between 1 and 20 then raise exception using errcode='22023',message='Add between one and twenty athletes'; end if;
  if jsonb_array_length(p_data->'contact'->'athlete_ids')<>0 then raise exception using errcode='22023',message='New family links must use its new athletes'; end if;
  for entry in select value from jsonb_array_elements(p_data->'athletes') loop perform public.member_validate_draft('athlete',entry); end loop;
 else
  select * into f from public.member_families where id=p_family_id and club_id=tenant for update;
  if not found then raise exception using errcode='42501',message='Family is unavailable'; end if;
  fid:=f.id;
  if p_action='save_family' then
   if p_record_id is distinct from fid then raise exception using errcode='42501',message='Family target mismatch'; end if;
   current_stamp:=f.updated_at;perform public.member_validate_draft('family',p_data);
  elsif p_action='save_contact' then
   perform public.member_validate_draft('contact',p_data);
   if p_record_id is not null then
    select * into c from public.member_contacts where id=p_record_id and club_id=tenant and family_id=fid for update;
    if not found then raise exception using errcode='42501',message='Contact is unavailable'; end if;
    current_stamp:=c.updated_at;
   end if;
   select coalesce(array_agg(value::uuid),array[]::uuid[]) into chosen from jsonb_array_elements_text(p_data->'athlete_ids');
   if exists(select 1 from unnest(chosen) x where not exists(select 1 from public.member_athletes where id=x and club_id=tenant and family_id=fid)) then raise exception using errcode='42501',message='Contact links must stay within the family'; end if;
  elsif p_action='save_athlete' then
   perform public.member_validate_draft('athlete',p_data);
   if p_record_id is not null then
    select * into a from public.member_athletes where id=p_record_id and club_id=tenant and family_id=fid for update;
    if not found then raise exception using errcode='42501',message='Athlete is unavailable'; end if;
    current_stamp:=a.updated_at;
   end if;
  elsif p_action='set_status' then
   if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('entity','status'))
    or coalesce(p_data->>'status','') not in ('active','archived') then raise exception using errcode='22023',message='Invalid archive action'; end if;
   if p_data->>'entity'='family' and p_record_id=fid then current_stamp:=f.updated_at;
   elsif p_data->>'entity'='contact' then
    select updated_at into current_stamp from public.member_contacts where id=p_record_id and club_id=tenant and family_id=fid for update;
   elsif p_data->>'entity'='athlete' then
    select updated_at into current_stamp from public.member_athletes where id=p_record_id and club_id=tenant and family_id=fid for update;
   end if;
   if current_stamp is null then raise exception using errcode='42501',message='Record is unavailable'; end if;
  end if;
  if p_record_id is not null and (p_expected_updated_at is null or current_stamp is distinct from p_expected_updated_at) then raise exception using errcode='40001',message='Record changed; reload before saving'; end if;
 end if;
 -- Warnings are tenant scoped and contain no matching customer identities.
 if p_action in ('create_family','save_contact') then
  d:=case when p_action='create_family' then p_data->'contact' else p_data end;
  if nullif(btrim(d->>'email'),'') is not null and exists(select 1 from public.member_contacts where club_id=tenant and id is distinct from p_record_id and lower(btrim(email))=lower(btrim(d->>'email'))) then warnings:=array_append(warnings,'A contact in this club already uses this email.'); end if;
  if public.member_phone_key(d->>'phone')<>'' and exists(select 1 from public.member_contacts where club_id=tenant and id is distinct from p_record_id and public.member_phone_key(phone)=public.member_phone_key(d->>'phone')) then warnings:=array_append(warnings,'A contact in this club already uses this mobile number.'); end if;
 end if;
 if p_action in ('create_family','save_athlete') then
  for entry in select value from jsonb_array_elements(case when p_action='create_family' then p_data->'athletes' else jsonb_build_array(p_data) end) loop
   if exists(select 1 from public.member_athletes where club_id=tenant and id is distinct from p_record_id
     and lower(btrim(display_name))=lower(btrim(entry->>'first_name')||' '||btrim(entry->>'last_name')) and date_of_birth=(entry->>'date_of_birth')::date) then warnings:=array_append(warnings,'An athlete in this club already has this name and date of birth.'); end if;
  end loop;
  if p_action='create_family' and exists(select 1 from jsonb_array_elements(p_data->'athletes') x group by lower(btrim(x->>'first_name')||' '||btrim(x->>'last_name')),x->>'date_of_birth' having count(*)>1) then warnings:=array_append(warnings,'Two athletes in this request have the same name and date of birth.'); end if;
 end if;
 if cardinality(warnings)>0 and p_ack_duplicates is distinct from true then return jsonb_build_object('requires_confirmation',true,'warnings',to_jsonb(warnings)); end if;
 if p_action='create_family' then
  insert into public.member_families(club_id,display_name,status) values(tenant,btrim(p_data->'family'->>'display_name'),p_data->'family'->>'status') returning id into fid;
  d:=p_data->'contact';
  insert into public.member_contacts(club_id,family_id,display_name,first_name,last_name,email,phone)
   values(tenant,fid,btrim(d->>'first_name')||' '||btrim(d->>'last_name'),btrim(d->>'first_name'),btrim(d->>'last_name'),nullif(lower(btrim(d->>'email')),''),nullif(btrim(d->>'phone'),'')) returning id into cid;
  if (d->>'is_primary')::boolean then update public.member_families set primary_contact_id=cid where id=fid and club_id=tenant; end if;
  for entry in select value from jsonb_array_elements(p_data->'athletes') loop
   insert into public.member_athletes(club_id,family_id,display_name,first_name,last_name,date_of_birth,gender,journey_status)
    values(tenant,fid,btrim(entry->>'first_name')||' '||btrim(entry->>'last_name'),btrim(entry->>'first_name'),btrim(entry->>'last_name'),(entry->>'date_of_birth')::date,nullif(btrim(entry->>'gender'),''),entry->>'journey_status') returning id into aid;
   insert into public.member_athlete_contacts(club_id,athlete_id,contact_id,relationship,is_primary,is_emergency)
    values(tenant,aid,cid,d->>'relationship',(d->>'is_primary')::boolean,(d->>'is_emergency')::boolean);
  end loop;
 elsif p_action='save_family' then
  update public.member_families set display_name=btrim(p_data->>'display_name'),status=p_data->>'status' where id=fid and club_id=tenant;
 elsif p_action='save_athlete' then
  if p_record_id is null then
   insert into public.member_athletes(club_id,family_id,display_name,first_name,last_name,date_of_birth,gender,journey_status)
   values(tenant,fid,btrim(p_data->>'first_name')||' '||btrim(p_data->>'last_name'),btrim(p_data->>'first_name'),btrim(p_data->>'last_name'),(p_data->>'date_of_birth')::date,nullif(btrim(p_data->>'gender'),''),p_data->>'journey_status');
  else
   update public.member_athletes set display_name=btrim(p_data->>'first_name')||' '||btrim(p_data->>'last_name'),first_name=btrim(p_data->>'first_name'),last_name=btrim(p_data->>'last_name'),date_of_birth=(p_data->>'date_of_birth')::date,gender=nullif(btrim(p_data->>'gender'),''),journey_status=p_data->>'journey_status' where id=p_record_id and club_id=tenant and family_id=fid;
  end if;
 elsif p_action='save_contact' then
  d:=p_data;
  if p_record_id is null then
   insert into public.member_contacts(club_id,family_id,display_name,first_name,last_name,email,phone)
   values(tenant,fid,btrim(d->>'first_name')||' '||btrim(d->>'last_name'),btrim(d->>'first_name'),btrim(d->>'last_name'),nullif(lower(btrim(d->>'email')),''),nullif(btrim(d->>'phone'),'')) returning id into cid;
  else
   cid:=p_record_id;
   if c.status='archived' then raise exception using errcode='22023',message='Reactivate the contact before editing links'; end if;
   update public.member_contacts set display_name=btrim(d->>'first_name')||' '||btrim(d->>'last_name'),first_name=btrim(d->>'first_name'),last_name=btrim(d->>'last_name'),email=nullif(lower(btrim(d->>'email')),''),phone=nullif(btrim(d->>'phone'),'') where id=cid and club_id=tenant and family_id=fid;
  end if;
  if (d->>'is_primary')::boolean then update public.member_families set primary_contact_id=cid where id=fid and club_id=tenant;
  elsif f.primary_contact_id=cid then update public.member_families set primary_contact_id=null where id=fid and club_id=tenant; end if;
  update public.member_athlete_contacts r set status='archived',is_primary=false where r.club_id=tenant and r.contact_id=cid
    and exists(select 1 from public.member_athletes where id=r.athlete_id and club_id=tenant and family_id=fid);
  foreach linked in array chosen loop
   if (d->>'is_primary')::boolean then update public.member_athlete_contacts set is_primary=false where club_id=tenant and athlete_id=linked and is_primary; end if;
   insert into public.member_athlete_contacts(club_id,athlete_id,contact_id,relationship,is_primary,is_emergency,status)
    values(tenant,linked,cid,d->>'relationship',(d->>'is_primary')::boolean,(d->>'is_emergency')::boolean,'active')
    on conflict(club_id,athlete_id,contact_id) do update set relationship=excluded.relationship,is_primary=excluded.is_primary,is_emergency=excluded.is_emergency,status='active';
  end loop;
 elsif p_action='set_status' then
  if p_data->>'entity'='family' then update public.member_families set status=p_data->>'status' where id=fid and club_id=tenant;
  elsif p_data->>'entity'='athlete' then update public.member_athletes set status=p_data->>'status' where id=p_record_id and club_id=tenant and family_id=fid;
  else
   update public.member_contacts set status=p_data->>'status' where id=p_record_id and club_id=tenant and family_id=fid;
   if p_data->>'status'='archived' then
    update public.member_families set primary_contact_id=null where id=fid and club_id=tenant and primary_contact_id=p_record_id;
    update public.member_athlete_contacts set status='archived',is_primary=false where club_id=tenant and contact_id=p_record_id;
   end if;
  end if;
 end if;
 return jsonb_build_object('family_id',fid,'requires_confirmation',false);
end
$fn$;

-- Keep table/column grants unchanged. Only these two projections/actions are exposed.
alter function public.member_directory(text,integer,uuid) owner to postgres;
alter function public.member_manage(text,uuid,uuid,timestamptz,jsonb,boolean) owner to postgres;
alter function public.member_management_club() owner to postgres;
alter function public.member_phone_key(text) owner to postgres;
alter function public.member_validate_draft(text,jsonb) owner to postgres;
revoke all on function public.member_phone_key(text) from public,anon,authenticated,service_role;
revoke all on function public.member_validate_draft(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.member_management_club() from public,anon,authenticated,service_role;
revoke all on function public.member_directory(text,integer,uuid) from public,anon,authenticated,service_role;
revoke all on function public.member_manage(text,uuid,uuid,timestamptz,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.member_directory(text,integer,uuid) to authenticated;
grant execute on function public.member_manage(text,uuid,uuid,timestamptz,jsonb,boolean) to authenticated;
commit;
