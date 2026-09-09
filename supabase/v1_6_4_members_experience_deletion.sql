-- Forward-only after v1_6_3. Installs capabilities; deletes no existing records.
begin;
set local lock_timeout='5s';
create table public.member_deletion_activity(
 id uuid primary key default gen_random_uuid(),
 club_id uuid not null references public.clubs(id) on delete restrict,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 entity text not null check(entity in ('family','athlete')),
 family_count integer not null check(family_count>=0),
 contact_count integer not null check(contact_count>=0),
 athlete_count integer not null check(athlete_count>=0),
 relationship_count integer not null check(relationship_count>=0)
);
create index member_deletion_activity_club_idx on public.member_deletion_activity(club_id,created_at desc);
alter table public.member_deletion_activity enable row level security;
alter table public.member_deletion_activity force row level security;
revoke all on public.member_deletion_activity from public,anon,authenticated,service_role;
create policy member_deletion_activity_read on public.member_deletion_activity for select to authenticated using(public.can_read_member_data(club_id));
-- Audit is retained server-side; no direct browser grants.
create function public.member_delete(p_family_id uuid,p_athlete_id uuid,p_confirmation text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $fn$
declare tenant uuid; f public.member_families%rowtype; a public.member_athletes%rowtype;
 families uuid[]; athletes uuid[]; contacts uuid[]; links uuid[]; target_ids uuid[];
 dep record; blocked boolean; nf integer:=0; na integer:=0; nc integer:=0; nr integer:=0;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Authentication required'; end if;
 select p.club_id into tenant from public.profiles p join public.clubs c on c.id=p.club_id
 where p.id=auth.uid() and p.role='club_owner' and p.is_active and c.active for update of c for share of p;
 if tenant is null then raise exception using errcode='42501',message='Active Club Owner required'; end if;
 -- Serialise member writes and prevent concurrent dependency creation via FK checks.
 lock table public.member_families,public.member_contacts,public.member_athletes,public.member_athlete_contacts in share row exclusive mode;
 select * into f from public.member_families where id=p_family_id and club_id=tenant for update;
 if f.id is null then raise exception using errcode='42501',message='Family unavailable'; end if;
 if p_athlete_id is not null then
  select * into a from public.member_athletes where id=p_athlete_id and club_id=tenant and family_id=f.id for update;
  if a.id is null then raise exception using errcode='42501',message='Athlete unavailable'; end if;
 end if;
 if p_confirmation is distinct from (case when p_athlete_id is null then f.display_name else a.display_name end) then
  raise exception using errcode='22023',message='Confirmation name does not match';
 end if;
 families:=case when p_athlete_id is null then array[f.id] else array[]::uuid[] end;
 select coalesce(array_agg(id),array[]::uuid[]) into athletes from public.member_athletes where club_id=tenant and family_id=f.id and (p_athlete_id is null or id=p_athlete_id);
 select coalesce(array_agg(id),array[]::uuid[]) into contacts from public.member_contacts where club_id=tenant and family_id=f.id and p_athlete_id is null;
 select coalesce(array_agg(id),array[]::uuid[]) into links from public.member_athlete_contacts where club_id=tenant and (athlete_id=any(athletes) or contact_id=any(contacts));
 perform 1 from public.member_contacts where club_id=tenant and id=any(contacts) for update;
 perform 1 from public.member_athletes where club_id=tenant and id=any(athletes) for update;
 perform 1 from public.member_athlete_contacts where club_id=tenant and id=any(links) for update;
 if exists(select 1 from public.member_contacts where club_id=tenant and id=any(contacts) and auth_user_id is not null)
 or exists(select 1 from public.member_athlete_contacts where club_id=tenant and contact_id=any(contacts) and not(athlete_id=any(athletes))) then
  raise exception using errcode='23503',message='Retained relationships exist. Archive instead.';
 end if;
 -- Discover external FK dependencies, including ON DELETE CASCADE/SET NULL.
 -- Any referenced ID column is sufficient to conservatively block deletion.
 for dep in
 select distinct n.nspname,c.relname,att.attname,k.confrelid
 from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
 cross join lateral unnest(k.conkey,k.confkey) keys(local_key,foreign_key)
 join pg_attribute att on att.attrelid=k.conrelid and att.attnum=keys.local_key
 join pg_attribute ref on ref.attrelid=k.confrelid and ref.attnum=keys.foreign_key
 where k.contype='f' and ref.attname='id'
 and k.confrelid=any(array['public.member_families'::regclass,'public.member_contacts'::regclass,'public.member_athletes'::regclass,'public.member_athlete_contacts'::regclass])
 and not(k.conrelid=any(array['public.member_families'::regclass,'public.member_contacts'::regclass,'public.member_athletes'::regclass,'public.member_athlete_contacts'::regclass]))
 loop
  target_ids:=case dep.confrelid when 'public.member_families'::regclass then families when 'public.member_contacts'::regclass then contacts when 'public.member_athletes'::regclass then athletes else links end;
  execute format('select exists(select 1 from %I.%I where %I=any($1))',dep.nspname,dep.relname,dep.attname) into blocked using target_ids;
  if blocked then raise exception using errcode='23503',message='Retained records exist. Archive instead.'; end if;
 end loop;
 -- Also guard conventional UUID references without FKs. Lock those tables to
 -- prevent a concurrent insert between the check and deletion.
 for dep in select n.nspname,c.relname,att.attname from pg_attribute att join pg_class c on c.oid=att.attrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p') and att.atttypid='uuid'::regtype and not att.attisdropped
 and att.attname in ('family_id','member_family_id','athlete_id','member_athlete_id','contact_id','member_contact_id')
 and c.relname not in ('member_families','member_contacts','member_athletes','member_athlete_contacts')
 loop
  execute format('lock table %I.%I in share mode',dep.nspname,dep.relname);
  target_ids:=case when dep.attname in ('family_id','member_family_id') then families when dep.attname in ('athlete_id','member_athlete_id') then athletes else contacts end;
  execute format('select exists(select 1 from %I.%I where %I=any($1))',dep.nspname,dep.relname,dep.attname) into blocked using target_ids;
  if blocked then raise exception using errcode='23503',message='Retained records exist. Archive instead.'; end if;
 end loop;
 delete from public.member_athlete_contacts where club_id=tenant and id=any(links);get diagnostics nr=row_count;
 if p_athlete_id is null then
  update public.member_families set primary_contact_id=null,billing_contact_id=null where club_id=tenant and id=f.id;
 end if;
 delete from public.member_athletes where club_id=tenant and id=any(athletes);get diagnostics na=row_count;
 delete from public.member_contacts where club_id=tenant and id=any(contacts);get diagnostics nc=row_count;
 delete from public.member_families where club_id=tenant and id=any(families);get diagnostics nf=row_count;
 insert into public.member_deletion_activity(club_id,actor_id,entity,family_count,contact_count,athlete_count,relationship_count)
 values(tenant,auth.uid(),case when p_athlete_id is null then 'family' else 'athlete' end,nf,nc,na,nr);
 return jsonb_build_object('deleted',true,'families',nf,'contacts',nc,'athletes',na,'relationships',nr);
end
$fn$;
alter function public.member_delete(uuid,uuid,text) owner to postgres;
revoke all on function public.member_delete(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.member_delete(uuid,uuid,text) to authenticated;
create function public.member_directory_filtered(p_search text default '',p_offset integer default 0,p_family_id uuid default null,p_state text default 'all',p_journey text default 'all',p_view text default 'families')
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
 'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'display_name',c.display_name,'first_name',c.first_name,'last_name',c.last_name,'email',c.email,'phone',c.phone,'status',c.status,'updated_at',c.updated_at) order by c.display_name,c.id) from public.member_contacts c where c.club_id=tenant and c.family_id=f.id),'[]'::jsonb),
 'athletes',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'display_name',a.display_name,'first_name',a.first_name,'last_name',a.last_name,'date_of_birth',a.date_of_birth,'gender',a.gender,'journey_status',coalesce(a.journey_status,'active'),'status',a.status,'updated_at',a.updated_at) order by a.display_name,a.id) from public.member_athletes a where a.club_id=tenant and a.family_id=f.id),'[]'::jsonb),
 'relationships',coalesce((select jsonb_agg(jsonb_build_object('athlete_id',r.athlete_id,'contact_id',r.contact_id,'relationship',r.relationship,'is_primary',r.is_primary,'is_emergency',r.is_emergency,'status',r.status)) from public.member_athlete_contacts r join public.member_athletes a on a.id=r.athlete_id and a.club_id=r.club_id where r.club_id=tenant and a.family_id=f.id),'[]'::jsonb)
 ) order by f.display_name,f.id) from page f),'[]'::jsonb)) into result;
 return result;
end
$fn$;


alter function public.member_directory_filtered(text,integer,uuid,text,text,text) owner to postgres;
revoke all on function public.member_directory_filtered(text,integer,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.member_directory_filtered(text,integer,uuid,text,text,text) to authenticated;
commit;
