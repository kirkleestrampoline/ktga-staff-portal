-- Read-only: one JSON value, no member contents or mutations.
with expected(signature,body_md5,exposed) as(values ('public.member_activity_stamp()','dbbb491b297842359e941cc0aa385a0f',false),('public.member_essentials(uuid,text,uuid,jsonb,timestamptz)','a4f2c5dbb072a401e32b68dd75508379',true),('public.member_directory_filtered(text,integer,uuid,text,text,text)','dc69be4f8ca52ad9c32a78fd56201a3f',true)), checks as(
 select e.signature,p.oid is not null as present,coalesce(md5(p.prosrc)=e.body_md5,false) as expected_body,
 coalesce(p.prosecdef and pg_get_userbyid(p.proowner)='postgres',false) as context_correct,
 coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE')=e.exposed,false) as authenticated_correct,
 coalesce(not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('service_role',p.oid,'EXECUTE'),false) as other_roles_blocked,
 not exists(select 1 from aclexplode(case when cardinality(coalesce(p.proacl,acldefault('f',p.proowner)))>0 then coalesce(p.proacl,acldefault('f',p.proowner)) else null::aclitem[] end) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_blocked
 from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
), tables as (
 select t.name,c.oid is not null as present,coalesce(c.relrowsecurity and c.relforcerowsecurity,false) as forced_rls,
 not exists(select 1 from unnest(array['anon','authenticated']) r(role_name) cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) v(privilege) where has_table_privilege(r.role_name,c.oid,v.privilege)) as no_table_grants
 from (values('member_activity'),('member_internal_notes')) t(name) left join pg_class c on c.oid=to_regclass('public.'||t.name)
), sensitive as (
 select coalesce(bool_and(exists(select 1 from pg_attribute a where a.attrelid=to_regclass('public.'||t.tab) and a.attname=t.col and not a.attisdropped and not has_column_privilege('authenticated',a.attrelid,a.attnum,'SELECT') and not has_column_privilege('authenticated',a.attrelid,a.attnum,'UPDATE'))),false) as protected
 from (values('member_athletes','medical_notes'),('member_athletes','allergies'),('member_contacts','communication_preferences'),('member_contacts','portal_status'),('member_families','billing_address')) t(tab,col)
)
select jsonb_build_object('read_only',true,'functions',(select jsonb_agg(to_jsonb(c)) from checks c),'tables',(select jsonb_agg(to_jsonb(t)) from tables t),'sensitive_columns_protected',(select protected from sensitive),
 'passed',(select bool_and(present and expected_body and context_correct and authenticated_correct and other_roles_blocked and public_blocked) from checks) and (select bool_and(present and forced_rls and no_table_grants) from tables) and (select protected from sensitive)) as members_finishing_verification;
