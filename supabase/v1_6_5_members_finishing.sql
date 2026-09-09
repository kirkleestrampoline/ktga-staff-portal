-- Forward only after v1_6_4. No backfill, invitations or Auth changes.
begin;
set local lock_timeout='5s';
alter table public.member_athletes add column allergies text;
alter table public.member_contacts add column portal_status text not null default 'not_invited' check(portal_status in ('not_invited','invited','active','disabled'));
create table public.member_internal_notes(
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),family_id uuid not null,athlete_id uuid,
 body text not null check(length(btrim(body)) between 1 and 4000),created_at timestamptz not null default now(),actor_id uuid not null references public.profiles(id),
 foreign key(club_id,family_id) references public.member_families(club_id,id) on delete restrict,
 foreign key(club_id,athlete_id) references public.member_athletes(club_id,id) on delete restrict
);
create index member_internal_notes_family_idx on public.member_internal_notes(club_id,family_id,created_at desc);
-- Generic events deliberately retain no names, field values or medical details.
-- Text key permits deletion of unreferenced test families while retaining the audit.
create table public.member_activity(
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),family_key text not null,
 entity text not null check(entity in ('family','contact','athlete')),action text not null check(action in ('created','updated','deleted')),
 created_at timestamptz not null default now(),actor_id uuid references public.profiles(id)
);
create index member_activity_family_idx on public.member_activity(club_id,family_key,created_at desc);
alter table public.member_internal_notes enable row level security;
alter table public.member_internal_notes force row level security;
alter table public.member_activity enable row level security;
alter table public.member_activity force row level security;
revoke all on public.member_internal_notes,public.member_activity from public,anon,authenticated,service_role;
create policy member_internal_notes_read on public.member_internal_notes for select to authenticated using(public.can_read_member_data(club_id));
create policy member_activity_read on public.member_activity for select to authenticated using(public.can_read_member_data(club_id));
create function public.member_activity_stamp() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $fn$
declare r jsonb;begin
 r:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 insert into public.member_activity(club_id,family_key,entity,action,actor_id)
 values((r->>'club_id')::uuid,case when TG_TABLE_NAME='member_families' then r->>'id' else r->>'family_id' end,
 case TG_TABLE_NAME when 'member_families' then 'family' when 'member_contacts' then 'contact' else 'athlete' end,
 case TG_OP when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,auth.uid());
 return null;
end
$fn$;
create trigger member_families_activity after insert or update or delete on public.member_families for each row execute function public.member_activity_stamp();
create trigger member_contacts_activity after insert or update or delete on public.member_contacts for each row execute function public.member_activity_stamp();
create trigger member_athletes_activity after insert or update or delete on public.member_athletes for each row execute function public.member_activity_stamp();
create function public.member_essentials(p_family_id uuid,p_action text default 'read',p_record_id uuid default null,p_data jsonb default '{}'::jsonb,p_stamp timestamptz default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $fn$
declare tenant uuid; f public.member_families%rowtype; stamp timestamptz; prefs jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Authentication required'; end if;
 select p.club_id into tenant from public.profiles p join public.clubs c on c.id=p.club_id where p.id=auth.uid() and p.role in ('club_owner','org_admin') and p.is_active and c.active for share of p for update of c;
 if tenant is null then raise exception using errcode='42501',message='Member access denied'; end if;
 select * into f from public.member_families where club_id=tenant and id=p_family_id for update;
 if f.id is null then raise exception using errcode='42501',message='Family unavailable'; end if;
 if p_action='read' then
  return jsonb_build_object('address',coalesce(f.billing_address,''),'updated_at',f.updated_at,
   'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at,'preferences',jsonb_build_object('email',communication_preferences->'email','sms',communication_preferences->'sms','marketing',communication_preferences->'marketing'),'portal_status',portal_status)) from public.member_contacts where club_id=tenant and family_id=f.id),'[]'::jsonb),
   'athletes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at,'medical_notes',coalesce(medical_notes,''),'allergies',coalesce(allergies,''))) from public.member_athletes where club_id=tenant and family_id=f.id),'[]'::jsonb),
   'notes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'athlete_id',athlete_id,'body',body,'created_at',created_at) order by created_at desc) from public.member_internal_notes where club_id=tenant and family_id=f.id),'[]'::jsonb),
   'activity',coalesce((select jsonb_agg(to_jsonb(events) order by created_at desc) from (select entity,action,created_at from public.member_activity where club_id=tenant and family_key=f.id::text order by created_at desc limit 50) events),'[]'::jsonb));
 end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception using errcode='22023',message='Invalid details'; end if;
 if p_action='address' then
  if exists(select 1 from jsonb_object_keys(p_data) k where k<>'address') or jsonb_typeof(p_data->'address') is distinct from 'string' or length(p_data->>'address')>1000 then raise exception using errcode='22023',message='Invalid address'; end if;
  stamp:=f.updated_at;
 elsif p_action='preferences' then
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('email','sms','marketing')) or
   exists(select 1 from unnest(array['email','sms','marketing']) k where jsonb_typeof(p_data->k) not in ('boolean','null') or not(p_data ? k)) then raise exception using errcode='22023',message='Invalid preferences'; end if;
  select updated_at,communication_preferences into stamp,prefs from public.member_contacts where club_id=tenant and family_id=f.id and id=p_record_id for update;
 elsif p_action='medical' then
  if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('medical_notes','allergies')) or
   exists(select 1 from unnest(array['medical_notes','allergies']) k where jsonb_typeof(p_data->k) is distinct from 'string' or length(p_data->>k)>4000) then raise exception using errcode='22023',message='Invalid medical details'; end if;
  select updated_at into stamp from public.member_athletes where club_id=tenant and family_id=f.id and id=p_record_id for update;
 elsif p_action='note' then
  if exists(select 1 from jsonb_object_keys(p_data) k where k<>'body') or jsonb_typeof(p_data->'body') is distinct from 'string' or coalesce(length(btrim(p_data->>'body')),0) not between 1 and 4000 then raise exception using errcode='22023',message='Invalid note'; end if;
  if p_record_id is not null and not exists(select 1 from public.member_athletes where id=p_record_id and club_id=tenant and family_id=f.id) then raise exception using errcode='42501',message='Athlete unavailable'; end if;
  insert into public.member_internal_notes(club_id,family_id,athlete_id,body,actor_id) values(tenant,f.id,p_record_id,btrim(p_data->>'body'),auth.uid());
  return jsonb_build_object('saved',true);
 else raise exception using errcode='22023',message='Unsupported action';
 end if;
 if stamp is null then raise exception using errcode='42501',message='Record unavailable'; end if;
 if p_stamp is distinct from stamp then raise exception using errcode='40001',message='Record changed; reload'; end if;
 if p_action='address' then update public.member_families set billing_address=nullif(btrim(p_data->>'address'),'') where club_id=tenant and id=f.id;
 elsif p_action='preferences' then update public.member_contacts set communication_preferences=prefs||p_data where club_id=tenant and family_id=f.id and id=p_record_id;
 else update public.member_athletes set medical_notes=nullif(btrim(p_data->>'medical_notes'),''),allergies=nullif(btrim(p_data->>'allergies'),'') where club_id=tenant and family_id=f.id and id=p_record_id;
 end if;
 return jsonb_build_object('saved',true);
end
$fn$;
alter function public.member_activity_stamp() owner to postgres;
alter function public.member_essentials(uuid,text,uuid,jsonb,timestamptz) owner to postgres;
revoke all on function public.member_activity_stamp(),public.member_essentials(uuid,text,uuid,jsonb,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.member_essentials(uuid,text,uuid,jsonb,timestamptz) to authenticated;
create or replace function public.member_directory_filtered(p_search text default '',p_offset integer default 0,p_family_id uuid default null,p_state text default 'all',p_journey text default 'all',p_view text default 'families')
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $fn$
declare tenant uuid; result jsonb; needle text;
begin
 tenant:=public.member_management_club();
 if p_view is null or p_view not in ('families','athletes') or p_state is null or p_state not in ('all','active','archived') or p_journey is null or p_journey not in ('all','enquiry','trial','waiting_list','active','paused','former') then raise exception using errcode='22023',message='Invalid filters'; end if;
 needle:=lower(btrim(coalesce(p_search,'')));
 if length(needle)>100 or p_offset is null or p_offset<0 then raise exception using errcode='22023',message='Invalid search'; end if;
 with matching as (
 select f.* from public.member_families f where f.club_id=tenant and (p_family_id is null or f.id=p_family_id)
 and (p_view='athletes' or p_state='all' or f.status=p_state)
 and ((p_journey='all' and p_view='families') or exists(select 1 from public.member_athletes j where j.club_id=tenant and j.family_id=f.id and (p_journey='all' or coalesce(j.journey_status,'active')=p_journey) and (p_view='families' or p_state='all' or j.status=p_state)))
 and (needle='' or strpos(lower(f.display_name),needle)>0
 or exists(select 1 from public.member_contacts c where c.club_id=tenant and c.family_id=f.id and
  (strpos(lower(c.display_name),needle)>0 or strpos(lower(coalesce(c.email,'')),needle)>0 or strpos(lower(coalesce(c.phone,'')),needle)>0
    or (length(public.member_phone_key(needle))>=3 and strpos(public.member_phone_key(c.phone),public.member_phone_key(needle))>0)))
 or exists(select 1 from public.member_athletes a where a.club_id=tenant and a.family_id=f.id and strpos(lower(a.display_name),needle)>0))
 ), page as(select * from matching order by display_name,id limit 25 offset p_offset)
 select jsonb_build_object(
 'can_delete',exists(select 1 from public.profiles where id=auth.uid() and club_id=tenant and role='club_owner' and is_active),
 'family_count',(select count(*) from public.member_families where club_id=tenant),
 'athlete_count',(select count(*) from public.member_athletes where club_id=tenant),
 'matched_families',(select count(*) from matching),
 'families',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'display_name',f.display_name,'status',f.status,'updated_at',f.updated_at,'primary_contact_id',f.primary_contact_id,
 'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'display_name',c.display_name,'first_name',c.first_name,'last_name',c.last_name,'email',c.email,'phone',c.phone,'portal_status',c.portal_status,'status',c.status,'updated_at',c.updated_at) order by c.display_name,c.id) from public.member_contacts c where c.club_id=tenant and c.family_id=f.id),'[]'::jsonb),
 'athletes',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'display_name',a.display_name,'first_name',a.first_name,'last_name',a.last_name,'date_of_birth',a.date_of_birth,'gender',a.gender,'journey_status',coalesce(a.journey_status,'active'),'status',a.status,'updated_at',a.updated_at) order by a.display_name,a.id) from public.member_athletes a where a.club_id=tenant and a.family_id=f.id),'[]'::jsonb),
 'relationships',coalesce((select jsonb_agg(jsonb_build_object('athlete_id',r.athlete_id,'contact_id',r.contact_id,'relationship',r.relationship,'is_primary',r.is_primary,'is_emergency',r.is_emergency,'status',r.status)) from public.member_athlete_contacts r join public.member_athletes a on a.id=r.athlete_id and a.club_id=r.club_id where r.club_id=tenant and a.family_id=f.id),'[]'::jsonb)
 ) order by f.display_name,f.id) from page f),'[]'::jsonb)) into result;
 return result;
end
$fn$;

commit;
