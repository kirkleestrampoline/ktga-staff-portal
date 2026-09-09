-- Read-only catalogue verification. No customer records or mutations returned.
with expected(signature,body_md5,exposed) as(values
 ('public.member_phone_key(text)','85c89eafe8a8f738a5f68296709d638b',false),
 ('public.member_management_club()','32a6d679d0123a0543c10c918884092a',false),
 ('public.member_validate_draft(text,jsonb)','2895b17b338ed008004e67f103ee15b6',false),
 ('public.member_directory(text,integer,uuid)','a3c8a6a07b04a48ac790b0e19dc35a3f',true),
 ('public.member_manage(text,uuid,uuid,timestamptz,jsonb,boolean)','f0e8b1476bb50e13f727ffb51dfc87b7',true)
), functions as(
 select e.signature,p.oid is not null as present,coalesce(md5(p.prosrc)=e.body_md5,false) as expected_body,
 coalesce(pg_get_userbyid(p.proowner)='postgres',false) as expected_owner,
 coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE')=e.exposed,false) as authenticated_correct,
 coalesce(not has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_blocked,
 coalesce(not has_function_privilege('service_role',p.oid,'EXECUTE'),false) as service_direct_blocked,
 coalesce(not e.exposed or p.prosecdef,false) as exposed_definer,
 not exists(select 1 from aclexplode(case when cardinality(coalesce(p.proacl,acldefault('f',p.proowner)))>0 then coalesce(p.proacl,acldefault('f',p.proowner)) else null::aclitem[] end) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_blocked
 from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
), tables as(
 select t.name,c.oid is not null as present,coalesce(c.relrowsecurity and c.relforcerowsecurity,false) as rls_forced,
 not exists(select 1 from unnest(array['anon','authenticated']) r(role_name) cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) v(privilege) where has_table_privilege(r.role_name,c.oid,v.privilege)) as direct_table_writes_blocked,
 not exists(select 1 from unnest(array['anon','authenticated']) r(role_name) cross join unnest(array['INSERT','UPDATE','REFERENCES']) v(privilege) where has_any_column_privilege(r.role_name,c.oid,v.privilege)) as direct_column_writes_blocked,
 coalesce(not has_any_column_privilege('anon',c.oid,'SELECT'),false) as anon_reads_blocked,
 coalesce(not has_table_privilege('authenticated',c.oid,'SELECT'),false) as no_broad_read_grant,
 (select jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'using',qual,'check',with_check)) from pg_policies where schemaname='public' and tablename=t.name) as policies
 from (values('member_families'),('member_contacts'),('member_athletes'),('member_athlete_contacts')) t(name)
 left join pg_class c on c.oid=to_regclass('public.'||t.name)
), columns as(
 select coalesce(bool_and(exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=e.table_name and c.column_name=e.column_name)),false) as present,
 coalesce(bool_and(not coalesce((select has_column_privilege('authenticated',a.attrelid,a.attnum,'SELECT') from pg_attribute a where a.attrelid=to_regclass('public.'||e.table_name) and a.attname=e.column_name and not a.attisdropped),true)),false) as new_columns_not_directly_readable
 from (values('member_families','primary_contact_id'),('member_contacts','first_name'),('member_contacts','last_name'),('member_athletes','first_name'),('member_athletes','last_name'),('member_athletes','gender'),('member_athletes','journey_status')) e(table_name,column_name)
)
select jsonb_build_object('read_only',true,
 'functions',(select jsonb_agg(to_jsonb(f) order by signature) from functions f),
 'tables',(select jsonb_agg(to_jsonb(t) order by name) from tables t),
 'columns',(select to_jsonb(c) from columns c),
 'passed',(select bool_and(present and expected_body and expected_owner and authenticated_correct and anon_blocked and service_direct_blocked and exposed_definer and public_blocked) from functions)
 and (select bool_and(present and rls_forced and direct_table_writes_blocked and direct_column_writes_blocked and anon_reads_blocked and no_broad_read_grant) from tables)
 and (select present and new_columns_not_directly_readable from columns),
 'note','Catalogue verification only. Test tenant isolation and complete workflows in staging.'
) as members_phase2_verification;
