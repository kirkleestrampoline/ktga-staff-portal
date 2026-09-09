-- Read-only: one JSON result; no promotion and no personal records.
with expected as (
 select $expected$CHECK ((action = ANY (ARRAY['club_created'::text, 'first_owner_created'::text, 'club_updated'::text, 'club_suspended'::text, 'club_reactivated'::text, 'club_owner_promoted'::text])))$expected$::text as definition
), checks as (
 select c.oid is not null as present,
 coalesce(c.convalidated,false) as validated,
 coalesce(regexp_replace(pg_get_constraintdef(c.oid),'\s+','','g')=
   regexp_replace(e.definition,'\s+','','g'),false) as expected_actions,
 pg_get_constraintdef(c.oid) as definition
 from expected e left join pg_constraint c
   on c.conrelid=to_regclass('public.platform_activity')
   and c.conname='platform_activity_action_valid' and c.contype='c'
)
select jsonb_build_object(
 'read_only',true,
 'passed',present and validated and expected_actions,
 'checks',to_jsonb(checks),
 'note','Confirms the action constraint only. No profile promoted; runtime promotion remains a separate manual action.'
) as activity_action_verification from checks;
