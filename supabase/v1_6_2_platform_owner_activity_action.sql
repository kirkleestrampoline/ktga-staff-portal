-- Forward fix: allow the audit action used by platform_promote_club_owner.
-- Does not invoke promotion or modify any existing record.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.platform_activity in access exclusive mode;
do $preflight$
declare live_definition text;
begin
 select pg_get_constraintdef(oid) into live_definition
 from pg_constraint
 where conrelid='public.platform_activity'::regclass
   and conname='platform_activity_action_valid' and contype='c';
 if live_definition is null or
   regexp_replace(live_definition,'\s+','','g') <>
   regexp_replace($expected$CHECK ((action = ANY (ARRAY['club_created'::text, 'first_owner_created'::text, 'club_updated'::text, 'club_suspended'::text, 'club_reactivated'::text])))$expected$,'\s+','','g') then
   raise exception 'Activity action constraint differs from the reviewed definition; stop and reconcile';
 end if;
end
$preflight$;
alter table public.platform_activity drop constraint platform_activity_action_valid;
alter table public.platform_activity add constraint platform_activity_action_valid
 check(action = any(array[
   'club_created'::text,'first_owner_created'::text,'club_updated'::text,
   'club_suspended'::text,'club_reactivated'::text,'club_owner_promoted'::text
 ]));
commit;
