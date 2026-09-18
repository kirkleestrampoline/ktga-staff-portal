-- READ ONLY. Run after applying v1_9_0; returns one JSON document and mutates nothing.
with expected_functions(name,signature,body_md5) as(values
 ('attendance_append_only','attendance_append_only()','f6632f1c9a6bd73407c025eec24d8655'),
 ('attendance_record_guard','attendance_record_guard()','4d7fe3c8092548fc4d56217f1f452733'),
 ('attendance_occurrence_guard','attendance_occurrence_guard()','1d100c1c3926d22632442c65fcef7430'),
 ('attendance_actor_club','attendance_actor_club()','91df8789077e1fb4d7b68c1f6da5862d'),
 ('attendance_is_admin','attendance_is_admin(uuid)','bcd14677886f1e89a97f72f52278d8e8'),
 ('attendance_can_access','attendance_can_access(uuid,uuid,date)','199b10c979685782e60402aa82da5b64'),
 ('attendance_occurrence_available','attendance_occurrence_available(uuid,uuid,date)','387dcd0e2d11e7f3baa20aa9899e9ea8'),
 ('attendance_effective_status','attendance_effective_status(uuid,date)','369fffeba42a5d2950cac9610d091618'),
 ('attendance_expected_count','attendance_expected_count(uuid,uuid,date)','c6e5fd4eaaa7c450c7b32c7c1df1ab06'),
 ('attendance_registers_for_date','attendance_registers_for_date(date)','47b9268de91527a7318dd617690fd43d'),
 ('attendance_open_register','attendance_open_register(uuid,date,uuid)','2422c892b7f237cf2a441e62aac0b6ca'),
 ('attendance_command','attendance_command(uuid,text,time without time zone,text,uuid)','bfff50011f2b556ef24bca92fe0ecab1'),
 ('attendance_recent_for_athlete','attendance_recent_for_athlete(uuid)','72bacc7d5f57992c1f004aed9d64bb78')
), protected_tables(name) as(values('member_families'),('member_athletes'),('class_profiles'),('classes'),('enrolments'),('enrolment_session_selections'),('scheduled_shifts'),('shifts'),('employment_records'),('timesheets'),('invoices')), attendance_tables(name) as(values('class_occurrences'),('attendance_records'),('attendance_audit'),('attendance_command_receipts'))
select jsonb_build_object(
 'read_only',true,
 'schema',jsonb_build_object(
  'tables',coalesce((select jsonb_agg(jsonb_build_object('name',a.name,'exists',to_regclass('public.'||a.name) is not null,'rls',coalesce(c.relrowsecurity,false),'forced_rls',coalesce(c.relforcerowsecurity,false),'authenticated_insert',has_table_privilege('authenticated','public.'||a.name,'insert'),'authenticated_update',has_table_privilege('authenticated','public.'||a.name,'update'),'authenticated_delete',has_table_privilege('authenticated','public.'||a.name,'delete')) order by a.name) from attendance_tables a left join pg_class c on c.oid=to_regclass('public.'||a.name)),'[]'::jsonb),
  'unique_occurrence',exists(select 1 from pg_constraint where conrelid=to_regclass('public.class_occurrences') and contype='u' and pg_get_constraintdef(oid)='UNIQUE (club_id, class_id, occurrence_date)'),
  'restrictive_attendance_links',(select count(*)=4 from pg_constraint where conrelid=to_regclass('public.attendance_records') and conname in ('attendance_occurrence_fk','attendance_family_fk','attendance_athlete_family_fk','attendance_enrolment_fk') and confdeltype='r'),
  'append_only_triggers',(select count(*)=4 from pg_trigger where not tgisinternal and tgname in ('attendance_audit_append_only','attendance_receipts_append_only','attendance_record_guard','attendance_occurrence_guard'))
 ),
 'functions',coalesce((select jsonb_agg(jsonb_build_object('name',e.name,'signature',e.signature,'exists',p.oid is not null,'expected_md5',e.body_md5,'actual_md5',md5(p.prosrc),'matches',md5(p.prosrc)=e.body_md5,'authenticated_execute',has_function_privilege('authenticated',p.oid,'execute')) order by e.name) from expected_functions e left join pg_proc p on p.oid=to_regprocedure('public.'||e.signature)),'[]'::jsonb),
 'policies',coalesce((select jsonb_agg(jsonb_build_object('table',tablename,'policy',policyname,'command',cmd,'roles',roles) order by tablename,policyname) from pg_policies where schemaname='public' and tablename in(select name from attendance_tables)),'[]'::jsonb),
 'club_counts',coalesce((select jsonb_agg(jsonb_build_object('club_id',c.id,'club',c.name,'slug',c.slug,'occurrences',(select count(*) from public.class_occurrences o where o.club_id=c.id),'attendance_records',(select count(*) from public.attendance_records r where r.club_id=c.id),'audit_rows',(select count(*) from public.attendance_audit a where a.club_id=c.id),'receipts',(select count(*) from public.attendance_command_receipts x where x.club_id=c.id)) order by c.name,c.id) from public.clubs c),'[]'::jsonb),
 'protected_fingerprints',coalesce((select jsonb_agg(jsonb_build_object('table',p.name,'rows',case p.name when 'member_families' then (select count(*) from public.member_families) when 'member_athletes' then (select count(*) from public.member_athletes) when 'class_profiles' then (select count(*) from public.class_profiles) when 'classes' then (select count(*) from public.classes) when 'enrolments' then (select count(*) from public.enrolments) when 'enrolment_session_selections' then (select count(*) from public.enrolment_session_selections) when 'scheduled_shifts' then (select count(*) from public.scheduled_shifts) when 'shifts' then (select count(*) from public.shifts) when 'employment_records' then (select count(*) from public.employment_records) when 'timesheets' then (select count(*) from public.timesheets) when 'invoices' then (select count(*) from public.invoices) end) order by p.name) from protected_tables p),'[]'::jsonb)
) as registers_attendance_verification;
