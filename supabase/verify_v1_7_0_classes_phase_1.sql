-- Read-only catalog verification. One JSON row; no operational record contents.
with expected(signature,body_md5,callable) as(values
('public.classes_phase1_shift_gate()','3ad6f7c69e9c69159508594edcdb05e8',false),
('public.classes_preserve_slot()','492927ccd6b2e75260aef2b671417f61',false),
('public.classes_save_taxonomy(text,jsonb)','5b63533eec4ebd75697aeebc8d78c07c',true),
('public.classes_save_profile(jsonb,jsonb)','7db239893e09f5b52496eb54121c3a74',true),
('public.classes_publish(uuid)','05be1b954f4063792dacb08f2ec6cd19',true),
('public.classes_calendar_data(date,date)','e23657248ab5b0f3d84e4a235d17da28',true),
('public.generate_schedule_month(date)','ed4819228b3c3248a0a88fa5afe4fa96',true)
), functions as (
 select e.signature,p.oid is not null as present,coalesce(md5(p.prosrc)=e.body_md5,false) as definition_matches,
 coalesce(p.prosecdef and p.proconfig @> array['search_path=pg_catalog, public'],false) as context_correct,
 coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE')=e.callable,false) as authenticated_correct,
 coalesce(not has_function_privilege('anon',p.oid,'EXECUTE'),false) as anonymous_blocked,
 not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_blocked
 from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
), tables as (
 select name,c.oid is not null as present,coalesce(c.relrowsecurity,false) as rls_enabled,
 coalesce(has_table_privilege('authenticated',c.oid,'SELECT'),false) as authenticated_read,
 coalesce(not has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),false) as direct_mutation_blocked,
 coalesce(not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),false) as anonymous_blocked
 from (values('class_categories'),('class_programmes'),('class_activity')) t(name)
 left join pg_class c on c.oid=to_regclass('public.'||t.name)
), triggers as (
 select name,exists(select 1 from pg_trigger where tgname=name and tgenabled='O' and not tgisinternal) as enabled
 from (values('classes_phase1_shift_gate'),('classes_preserve_slot'),('trg_skip_excluded_scheduled_occurrence'),('propagate_class_profile_to_sessions')) t(name)
), defaults as (
 select name,exists(select 1 from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
 where a.attrelid=to_regclass('public.'||tab) and a.attname=name and a.attnotnull and pg_get_expr(d.adbin,d.adrelid)=expected) as correct
 from (values('class_profiles','publication_status',quote_literal('draft')||'::text'),('class_profiles','visibility',quote_literal('internal')||'::text'),('class_staffing_slots','active','true')) t(tab,name,expected)
), legacy_expected(signature,callable) as(values
('public.generate_schedule_month(date)',true),
('public.confirm_scheduled_shift(uuid)',true),
('public.reassign_scheduled_shift(uuid, uuid)',true),
('public.set_scheduled_shift_cancelled(uuid, boolean)',true),
('public.unconfirm_scheduled_shift(uuid)',true),
('public.clone_schedule_month(date, date)',true),
('public.copy_schedule_week(date, date)',true),
('public.swap_scheduled_assignments(uuid, uuid)',true),
('public.sync_class_schedule(uuid)',true),
('public.confirm_scheduled_shift_adjusted(uuid, time without time zone, time without time zone, integer)',true),
('public.request_scheduled_overtime(uuid, time without time zone, time without time zone, integer, text)',true),
('public.cancel_scheduled_adjustment(uuid)',true),
('public.approve_scheduled_adjustment(uuid)',true),
('public.undo_own_scheduled_confirmation(uuid)',true),
('public.skip_excluded_scheduled_occurrence()',false),
('public.remove_scheduled_occurrence(uuid)',true),
('public.clear_schedule_month(date)',true),
('public.get_removed_schedule_occurrences(date)',true),
('public.restore_schedule_occurrence(uuid, date)',true),
('public.record_coaching_assignment()',false),
('public.apply_class_profile_to_session()',false),
('public.propagate_class_profile_to_sessions()',false),
('public.set_class_profile_active(uuid, boolean)',true),
('public.delete_class_profile_if_unused(uuid)',true),
('public.confirm_scheduled_actual(uuid, time without time zone, time without time zone, integer)',true)
), legacy_acl as (
 select e.signature,p.oid is not null as present,
 coalesce(not has_function_privilege('anon',p.oid,'EXECUTE'),false) as anonymous_blocked,
 coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE')=e.callable,false) as authenticated_correct,
 not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_blocked
 from legacy_expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
), metadata as (
 select name,exists(select 1 from pg_attribute where attrelid=to_regclass('public.class_profiles') and attname=name and not attisdropped) as present
 from (values('category_id'),('programme_id'),('start_date'),('end_date'),('description'),('eligibility_description'),('published_at'),('published_by'),('capacity'),('minimum_age'),('maximum_age')) x(name)
), relationships as (
 select name,exists(select 1 from pg_constraint where conname=name and conrelid=to_regclass('public.class_profiles') and convalidated) as present
 from (values('class_profile_category_club_fk'),('class_profile_programme_club_fk'),('class_profile_dates_valid')) x(name)
)
select jsonb_build_object(
 'legacy_acl',(select jsonb_agg(to_jsonb(l)) from legacy_acl l),
 'metadata',(select jsonb_agg(to_jsonb(m)) from metadata m),
 'relationships',(select jsonb_agg(to_jsonb(r)) from relationships r),
 'read_only',true,'functions',(select jsonb_agg(to_jsonb(f)) from functions f),
 'tables',(select jsonb_agg(to_jsonb(t)) from tables t),
 'triggers',(select jsonb_agg(to_jsonb(t)) from triggers t),
 'defaults',(select jsonb_agg(to_jsonb(d)) from defaults d),
 'catalog_passed', (select bool_and(present and definition_matches and context_correct and authenticated_correct and anonymous_blocked and public_blocked) from functions)
 and (select bool_and(present and rls_enabled and authenticated_read and direct_mutation_blocked and anonymous_blocked) from tables)
 and (select bool_and(present and anonymous_blocked and authenticated_correct and public_blocked) from legacy_acl)
 and (select bool_and(present) from metadata) and (select bool_and(present) from relationships)
 and (select bool_and(enabled) from triggers) and (select bool_and(correct) from defaults),
 'manual_acceptance_required',true,
 'scope','Catalog checks only. Migration itself checks row counts and original values before commit. Exercise publication, isolation, exclusions and slot preservation in Greenhead or an isolated test club; never Kirklees.'
) as classes_phase1_verification;
