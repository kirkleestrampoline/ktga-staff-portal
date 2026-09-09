-- Read-only: inspects the function catalogue, never invokes promotion.
with checks as (
 select p.oid is not null as present,
 coalesce(md5(p.prosrc)='b3b6372ba9e33a0dd2d3953ad7dc10d1',false) as expected_body,
 coalesce(p.prosecdef and pg_get_userbyid(p.proowner)='postgres',false) as expected_execution_context,
 coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as authenticated_can_call,
 coalesce(not has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_blocked,
 coalesce(not has_function_privilege('service_role',p.oid,'EXECUTE'),false) as service_direct_blocked,
 not exists(select 1 from aclexplode(case when cardinality(coalesce(p.proacl,acldefault('f',p.proowner)))>0
 then coalesce(p.proacl,acldefault('f',p.proowner)) else null::aclitem[] end) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute_removed,
 p.proconfig as configuration
 from (values(to_regprocedure('public.platform_promote_club_owner(uuid,uuid,text)'))) v(oid)
 left join pg_proc p on p.oid=v.oid
)
select jsonb_build_object('read_only',true,
 'passed',present and expected_body and expected_execution_context and authenticated_can_call and anon_blocked and service_direct_blocked and public_execute_removed,
 'checks',to_jsonb(checks),
 'note','Catalogue checks only. No profile promoted. Run authorisation and preservation acceptance tests in staging.'
) as owner_promotion_verification from checks;
