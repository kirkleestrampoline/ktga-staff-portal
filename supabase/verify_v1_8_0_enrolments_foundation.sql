-- Read-only JSON verification. PREPARED, NOT RUN.
with expected_functions(signature,body_md5,callable,definer) as(values
 ('public.enrolments_context(uuid,uuid,text)','9cc1f5a9e27dcee83824513f950faef4',true,true),
 ('public.enrolments_command(text,uuid,jsonb,uuid)','2d63f14a82a1f9e232669aca7c910b3c',true,true),
 ('public.enrolments_validate(uuid,text)','3d9ae28409c4bbc552109a7775e4b0fa',false,true),
 ('public.enrolment_row_guard()','604ad0d2d3330fecdd26aaa1e28976a2',false,false),
 ('public.enrolment_selection_guard()','e7ba06dc0fb870141a2fff15b6ed4cf6',false,false),
 ('public.enrolment_append_only()','59c8a4a7369addccc9d7fd710932f9b8',false,false)
), function_checks as(
 select e.signature,p.oid is not null present,md5(p.prosrc)=e.body_md5 reviewed_body_matches,
  coalesce(p.prosecdef,false)=e.definer security_mode_correct,
  coalesce(p.proconfig @> array['search_path=pg_catalog, public'],false) context_correct,
  coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE')=e.callable,false) authenticated_correct,
  coalesce(not has_function_privilege('anon',p.oid,'EXECUTE'),false) anonymous_blocked,
  coalesce(not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),false) public_blocked
 from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)
), expected_tables(name) as(values('enrolments'),('enrolment_session_selections'),('enrolment_status_history'),('enrolment_command_log')), table_checks as(
 select e.name,c.oid is not null present,coalesce(c.relrowsecurity and c.relforcerowsecurity,false) forced_rls,
  case when c.oid is null then false else not has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') end writes_blocked,
  case when c.oid is null then false else exists(select 1 from pg_policies p where p.schemaname='public' and p.tablename=e.name and p.cmd='SELECT' and p.roles @> array['authenticated']::name[]) end tenant_read_policy
 from expected_tables e left join pg_class c on c.oid=to_regclass('public.'||e.name)
), foreign_keys as(
 select count(*) filter(where confdeltype='r') restrict_count,count(*) filter(where confdeltype='n') actor_set_null_count,count(*) filter(where confdeltype='c') cascading_count
 from pg_constraint where contype='f' and conrelid in ('public.enrolments'::regclass,'public.enrolment_session_selections'::regclass,'public.enrolment_status_history'::regclass,'public.enrolment_command_log'::regclass)
), safeguards as(
 select
  exists(select 1 from pg_trigger where tgrelid='public.enrolments'::regclass and tgname='enrolment_row_guard' and tgenabled='O') enrolment_delete_guard,
  exists(select 1 from pg_trigger where tgrelid='public.enrolment_session_selections'::regclass and tgname='enrolment_selection_guard' and tgenabled='O') session_history_guard,
  exists(select 1 from pg_trigger where tgrelid='public.enrolment_status_history'::regclass and tgname='enrolment_history_append_only' and tgenabled='O') status_append_only,
  exists(select 1 from pg_trigger where tgrelid='public.enrolment_command_log'::regclass and tgname='enrolment_commands_append_only' and tgenabled='O') commands_append_only,
  exists(select 1 from pg_constraint where conrelid='public.enrolments'::regclass and conname='enrolments_athlete_family_fk') athlete_family_tenant_fk,
  exists(select 1 from pg_constraint where conrelid='public.enrolment_session_selections'::regclass and conname='enrolment_session_class_fk') recurrence_profile_tenant_fk,
  not exists(select 1 from pg_proc where oid in ('public.enrolments_context(uuid,uuid,text)'::regprocedure,'public.enrolments_command(text,uuid,jsonb,uuid)'::regprocedure) and prosrc~*'scheduled_shifts|timesheets|invoices|payments|billing') operational_isolation
), row_counts as(
 select jsonb_build_object('enrolments',(select count(*) from public.enrolments),'session_selections',(select count(*) from public.enrolment_session_selections),'status_history',(select count(*) from public.enrolment_status_history),'command_log',(select count(*) from public.enrolment_command_log)) counts
)
select jsonb_build_object(
 'read_only',true,
 'functions',(select jsonb_agg(to_jsonb(f) order by signature) from function_checks f),
 'tables',(select jsonb_agg(to_jsonb(t) order by name) from table_checks t),
 'foreign_keys',(select to_jsonb(f) from foreign_keys f),
 'safeguards',(select to_jsonb(s) from safeguards s),
 'row_counts',(select counts from row_counts),
 'passed',(select bool_and(present and reviewed_body_matches and security_mode_correct and context_correct and authenticated_correct and anonymous_blocked and public_blocked) from function_checks)
  and (select bool_and(present and forced_rls and writes_blocked and tenant_read_policy) from table_checks)
  and (select cascading_count=0 and restrict_count>=9 from foreign_keys)
  and (select enrolment_delete_guard and session_history_guard and status_append_only and commands_append_only and athlete_family_tenant_fk and recurrence_profile_tenant_fk and operational_isolation from safeguards)
) as enrolments_foundation_verification;
