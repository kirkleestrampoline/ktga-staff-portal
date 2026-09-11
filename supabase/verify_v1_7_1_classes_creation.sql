-- Read only. Run manually after reviewed forward migration; never generates shifts.
select column_name,data_type,column_default,is_nullable from information_schema.columns
 where table_schema='public' and table_name='class_staffing_slots' and column_name='default_payment_type';
select p.proname,p.prosecdef,p.proconfig,
 case p.proname
 when 'classes_save_profile' then md5(p.prosrc)='182f1c6ea1d0b3c50403394fb3437ed8'
 when 'classes_calendar_data' then md5(p.prosrc)='d3c38fa582844bb10f0a247abab84a17'
 end as reviewed_body_matches,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('classes_save_profile','classes_calendar_data');
-- In an authenticated Greenhead admin session only: inspect creation_version=2,
-- club-scoped coaches/qualifications, and saved recurrence notes/defaults through
-- classes_calendar_data. No production runtime checks have been performed.
