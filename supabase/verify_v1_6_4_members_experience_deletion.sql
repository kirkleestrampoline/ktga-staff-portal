-- Read-only, one JSON result. Never invokes deletion or returns personal records.
with expected(signature,body_md5) as(values ('public.member_delete(uuid,uuid,text)','eeb7b812d4a033f1bdf82f0d92717213'),('public.member_directory_filtered(text,integer,uuid,text,text,text)','edf8962a2d00daa744400af5c3c63f5c')), checks as(
 select signature,p.oid is not null as present,coalesce(md5(p.prosrc)=body_md5,false) as expected_body,
 coalesce(p.prosecdef and pg_get_userbyid(p.proowner)='postgres',false) as execution_context,
 coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as authenticated_call,
 coalesce(not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('service_role',p.oid,'EXECUTE'),false) as other_api_roles_blocked,
 not exists(select 1 from aclexplode(case when cardinality(coalesce(p.proacl,acldefault('f',p.proowner)))>0 then coalesce(p.proacl,acldefault('f',p.proowner)) else null::aclitem[] end) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_blocked
 from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
), audit as (
 select c.oid is not null as present,coalesce(c.relrowsecurity and c.relforcerowsecurity,false) as rls,
 not exists(select 1 from unnest(array['anon','authenticated']) r(role_name) cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) v(privilege) where has_table_privilege(r.role_name,c.oid,v.privilege)) as no_browser_grants
 from (values(to_regclass('public.member_deletion_activity'))) t(oid) left join pg_class c on c.oid=t.oid
)
select jsonb_build_object('read_only',true,'functions',(select jsonb_agg(to_jsonb(c)) from checks c),'audit',(select to_jsonb(a) from audit a),
 'passed',(select bool_and(present and expected_body and execution_context and authenticated_call and other_api_roles_blocked and public_blocked) from checks) and (select present and rls and no_browser_grants from audit),
 'note','Catalogue checks only. Exercise deletion and dependency protection in staging.') as members_deletion_verification;
