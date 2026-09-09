-- Additive action only. This migration does not promote any profile.
begin;
set local lock_timeout='5s';
create function public.platform_promote_club_owner(p_club_id uuid,p_profile_id uuid,p_expected_role text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $fn$
declare target public.profiles%rowtype; after_target public.profiles%rowtype;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Authentication required'; end if;
 perform 1 from public.profiles p join public.clubs c on c.id=p.club_id
 where p.id=auth.uid() and p.role='admin' and p.is_active=true and c.active=true
 for share of p,c;
 if not found then raise exception using errcode='42501',message='Active Platform Admin required'; end if;
 perform 1 from public.clubs where id=p_club_id and active=true for share;
 if not found then raise exception using errcode='P0001',message='Active target club required'; end if;
 select * into target from public.profiles where id=p_profile_id for update;
 if not found then raise exception using errcode='P0001',message='Target profile unavailable'; end if;
 if target.club_id is distinct from p_club_id or target.role='admin' or target.id=auth.uid() then
   raise exception using errcode='42501',message='Target cannot be promoted';
 end if;
 if target.is_active is distinct from true or target.role not in ('coach','org_admin')
   or p_expected_role is null or target.role is distinct from p_expected_role then
   raise exception using errcode='P0001',message='Target is inactive or its role changed';
 end if;
 update public.profiles set role='club_owner'
 where id=target.id and club_id=p_club_id and is_active=true and role=p_expected_role;
 if not found then raise exception using errcode='P0001',message='Target changed'; end if;
 -- Check persisted values after all profile triggers have run; fail closed on drift.
 select * into after_target from public.profiles where id=target.id;
 if after_target.role is distinct from 'club_owner' or
    (to_jsonb(after_target)-'role') is distinct from (to_jsonb(target)-'role') then
   raise exception using errcode='P0001',message='Profile preservation check failed';
 end if;
 insert into public.platform_activity(actor_id,club_id,action,entity_type,entity_id,details)
 values(auth.uid(),p_club_id,'club_owner_promoted','profiles',target.id,
   jsonb_build_object('previous_role',target.role,'new_role','club_owner'));
end
$fn$;
alter function public.platform_promote_club_owner(uuid,uuid,text) owner to postgres;
revoke all on function public.platform_promote_club_owner(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.platform_promote_club_owner(uuid,uuid,text) to authenticated;
commit;
