-- Read-only catalogue verification: one JSON value, no personal records.
with expected(table_name,tenant_fks) as(values
 ('member_families',1),('member_contacts',1),('member_athletes',1),('member_athlete_contacts',2)
), checks as(
 select e.table_name,c.oid is not null as present,coalesce(c.relrowsecurity and c.relforcerowsecurity,false) as rls_forced,
 (select count(*)=1 and bool_and(cmd='SELECT' and roles=array['authenticated']::name[] and qual='can_read_member_data(club_id)')
  from pg_policies where schemaname='public' and tablename=e.table_name) as read_policy_correct,
 (select count(*)=e.tenant_fks from pg_constraint k where k.conrelid=c.oid and k.contype='f' and array_length(k.conkey,1)>1) as composite_tenant_fks,
 exists(select 1 from pg_attribute where attrelid=c.oid and attname='club_id' and attnotnull) as tenant_required,
 exists(select 1 from pg_trigger where tgrelid=c.oid and tgfoid=to_regprocedure('public.member_record_stamp()') and tgenabled='O' and not tgisinternal) as stamp_installed,
 not exists(select 1 from unnest(array['anon','authenticated']) r(role_name)
   cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) v(privilege)
   where has_table_privilege(r.role_name,c.oid,v.privilege)) as api_table_writes_blocked,
 not exists(select 1 from unnest(array['anon','authenticated']) r(role_name)
   cross join unnest(array['INSERT','UPDATE','REFERENCES']) v(privilege)
   where has_any_column_privilege(r.role_name,c.oid,v.privilege)) as api_column_writes_blocked,
 not has_any_column_privilege('anon',c.oid,'SELECT') as anon_reads_blocked,
 (select coalesce(bool_and(has_column_privilege('authenticated',c.oid,a.attnum,'SELECT')=
    (e.table_name in ('member_families','member_athletes') and
     (a.attname in ('id','club_id','display_name','status') or (e.table_name='member_athletes' and a.attname='family_id')))),false)
  from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as exact_browser_projection,
 (select jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)) order by conname)
  from pg_constraint where conrelid=c.oid) as constraints,
 (select jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname)
  from pg_indexes where schemaname='public' and tablename=e.table_name) as indexes
 from expected e left join pg_class c on c.oid=to_regclass('public.'||e.table_name)
), functions as(
 select v.signature,p.oid is not null as present,coalesce(md5(p.prosrc)=v.body_md5,false) as expected_definition,
 coalesce(p.prosecdef=v.definer and pg_get_userbyid(p.proowner)='postgres',false) as execution_context_correct,
 coalesce(not has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_blocked,
 coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE')=v.definer,false) as authenticated_grant_correct
 from (values
 ('public.can_read_member_data(uuid)','e7a756128f8537c5526853d32f169281',true),
 ('public.member_record_stamp()','a7a125cc94d9080d7f185b46748d15c6',false)
 ) v(signature,body_md5,definer) left join pg_proc p on p.oid=to_regprocedure(v.signature)
)
select jsonb_build_object('read_only',true,
 'passed',(select coalesce(bool_and(present and rls_forced and coalesce(read_policy_correct,false) and composite_tenant_fks and tenant_required and stamp_installed and api_table_writes_blocked and api_column_writes_blocked and anon_reads_blocked and exact_browser_projection),false) from checks)
   and (select coalesce(bool_and(present and expected_definition and execution_context_correct and anon_blocked and authenticated_grant_correct),false) from functions),
 'tables',(select jsonb_agg(to_jsonb(c) order by table_name) from checks c),
 'functions',(select jsonb_agg(to_jsonb(f) order by signature) from functions f),
 'note','Catalogue checks only; tenant isolation and workflows require staging tests. No personal records returned.'
) as members_verification;
