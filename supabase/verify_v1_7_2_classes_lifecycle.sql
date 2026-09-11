-- Read-only JSON verification and ghost-class diagnostic. PREPARED, NOT RUN.
-- Set club_id to GREENHEAD'S verified ID before using the optional diagnostic.
-- NULL intentionally returns no class records. No RPC mutations/generation.
with params as (select null::uuid club_id,'test'::text class_name,(now() at time zone 'Europe/London')::date selected_date),
expected(signature,body_md5,callable) as (values
 ('public.classes_dependencies(uuid,boolean)','5692a69b9b2bbb292b3ef2037a16b708',false),
 ('public.classes_deletion_check(uuid)','c93db5ddbb52cbffae91862ca62bea27',true),
 ('public.classes_phase1_shift_gate()','2842862874cca93ca1c34e21655a8d42',false),
 ('public.apply_class_profile_to_session()','e324ee176a731ccb13a856ee5c829280',false),
 ('public.propagate_class_profile_to_sessions()','efc9929c97b0f11b8b51ca8901c66e7e',false),
 ('public.classes_save_profile(jsonb,jsonb)','8f7d0b8435ed4082ff1c89f8c4250ceb',false),
 ('public.classes_calendar_data(date,date)','93eb0b33b09cade2926db883c7b1be4f',true),
 ('public.generate_schedule_month(date)','7183982f62ce36b67592ef7926b52db5',true),
 ('public.classes_publish(uuid)','d11b7cfd3c692f0616ecf993bd620bbf',false),
 ('public.classes_command(text,uuid,jsonb,uuid)','5f18892209c305a462f0bbf28884228a',true),
 ('public.set_class_profile_active(uuid,boolean)','663f69e96ec272b3e95e82fb6bec55ad',true),
 ('public.delete_class_profile_if_unused(uuid)','151a90edf6e3e4e59207cde975d44247',true)
), functions as (
 select e.signature,p.oid is not null present,coalesce(md5(p.prosrc)=e.body_md5,false) reviewed_body_matches,
 coalesce(p.prosecdef and p.proconfig @> array['search_path=pg_catalog, public'],false) context_correct,
 coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE')=e.callable,false) authenticated_correct,
 coalesce(not has_function_privilege('anon',p.oid,'EXECUTE'),false) anonymous_blocked,
 not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public_blocked
 from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
), columns as (
 select tab,name,exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=tab and c.column_name=name) present
 from (values('class_profiles','archive_state'),('classes','effective_from'),('classes','effective_to'),('classes','duration_minutes')) v(tab,name)
), access as (
 select name,not has_table_privilege('authenticated','public.'||name,'INSERT,UPDATE,DELETE,TRUNCATE') and not has_any_column_privilege('authenticated','public.'||name,'INSERT,UPDATE') direct_mutation_blocked
 from (values('class_profiles'),('classes'),('class_staffing_slots')) v(name)
), diagnostic as (
 select p.id profile_id,c.id recurrence_id,coalesce(p.name,c.name) name,coalesce(p.club_id,c.club_id) club_id,
 p.active profile_active,c.active recurrence_active,p.publication_status,p.start_date,p.end_date,
 to_jsonb(c)->>'effective_from' effective_from,to_jsonb(c)->>'effective_to' effective_to,
 p.id is null or p.active=false profile_missing_from_old_active_only_loader,
 coalesce(c.active and (p.id is null or not p.active),false) old_loader_fallback_ghost_risk,
 coalesce(c.active and p.publication_status='published' and not p.active,false) old_generator_inactive_profile_risk,
 coalesce(p.active and p.publication_status='published' and c.active and (p.start_date is null or x.selected_date>=p.start_date) and (p.end_date is null or x.selected_date<=p.end_date)
  and ((to_jsonb(c)->>'effective_from') is null or x.selected_date>=(to_jsonb(c)->>'effective_from')::date)
  and ((to_jsonb(c)->>'effective_to') is null or x.selected_date<=(to_jsonb(c)->>'effective_to')::date),false) lifecycle_eligible_on_selected_date,
 (select count(*) from public.class_staffing_slots s where s.class_id=c.id and s.active) active_slots,
 (select count(*) from public.scheduled_shifts s where s.class_id=c.id) scheduled_records,
 (select count(*) from public.schedule_occurrence_exclusions e where e.class_id=c.id) exclusions,
 (select count(*) from public.class_activity a where a.class_profile_id=p.id) activity_records,
 case when p.active=false then 'Use Classes: Archived filter, then Repair archive. Restore only with a safe snapshot.' when p.end_date<x.selected_date then 'Ended: inspect selected date; do not delete dated history.' else 'Inspect recurrence/publication state and selected-date exclusions.' end suggested_action
 from public.class_profiles p full join public.classes c on c.class_profile_id=p.id cross join params x
 where x.club_id is not null and coalesce(p.club_id,c.club_id)=x.club_id and (lower(btrim(p.name))=lower(btrim(x.class_name)) or lower(btrim(c.name))=lower(btrim(x.class_name)))
), triggers as (
 select name,exists(select 1 from pg_trigger where tgrelid='public.scheduled_shifts'::regclass and tgname=name and tgenabled='O' and not tgisinternal) enabled
 from (values('classes_phase1_shift_gate'),('trg_skip_excluded_scheduled_occurrence')) v(name)
)
select jsonb_build_object('read_only',true,'functions',(select jsonb_agg(to_jsonb(f)) from functions f),'columns',(select jsonb_agg(to_jsonb(c)) from columns c),
 'direct_access',(select jsonb_agg(to_jsonb(a)) from access a),'triggers',(select jsonb_agg(to_jsonb(t)) from triggers t),
 'audit',jsonb_build_object('present',to_regclass('public.class_lifecycle_audit') is not null,'rls',coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.class_lifecycle_audit')),false),
  'authenticated_write_blocked',coalesce(not has_table_privilege('authenticated',to_regclass('public.class_lifecycle_audit'),'INSERT,UPDATE,DELETE,TRUNCATE'),false),
  'anonymous_blocked',coalesce(not has_table_privilege('anon',to_regclass('public.class_lifecycle_audit'),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),false)),
 'version_index_present',to_regclass('public.classes_profile_recurring_version_unique') is not null,
 'diagnostic_scope',(select club_id from params),'ghost_diagnostic',coalesce((select jsonb_agg(to_jsonb(d)) from diagnostic d),'[]')) as verification;
