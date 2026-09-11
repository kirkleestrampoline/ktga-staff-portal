-- Catalog-only inspection: one JSON row; no application records or mutations.
-- Text matches are discovery hints, NOT proof of runtime safety. Dynamic SQL,
-- external code and untracked calls can escape discovery. Review definitions.
-- Only search_path is returned from function configuration; no role settings,
-- connection strings, secret stores or table data are queried.
WITH RECURSIVE
wanted(name) AS (
  VALUES ('generate_schedule_month'), ('sync_class_schedule'),
    ('copy_schedule_week'), ('copy_schedule_month'), ('clone_schedule_month'),
    ('clear_schedule_month'), ('remove_scheduled_occurrence'),
    ('restore_schedule_occurrence'), ('get_removed_schedule_occurrences'),
    ('set_scheduled_shift_cancelled'), ('confirm_scheduled_shift'),
    ('confirm_scheduled_shift_adjusted'), ('confirm_scheduled_actual'),
    ('unconfirm_scheduled_shift')
),
base_names(name) AS (
  VALUES ('classes'), ('class_profiles'), ('class_sessions'),
    ('class_staffing_slots'), ('scheduled_shifts'), ('worked_shifts'),
    ('shifts'), ('timesheets'), ('venues'), ('training_areas')
),
relations AS (
  SELECT c.*, n.nspname AS schema_name
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
),
routines AS (
  SELECT p.*, n.nspname AS schema_name,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    AND n.nspname NOT LIKE 'pg_toast%' AND p.prokind IN ('f','p')
),
seed_tables AS (
  SELECT r.oid FROM relations r
  WHERE r.relname IN (SELECT name FROM base_names)
    OR r.relname ~* '(schedule|class).*(exclu|occurrence|exception|cancel)'
),
seed_functions AS (
  SELECT p.oid FROM routines p
  WHERE (p.schema_name='public' AND p.proname IN (SELECT name FROM wanted))
    -- Include readers too: safer discovery than trying to parse SQL writes.
    OR p.prosrc ~* '\m(classes|class_profiles|class_staffing_slots|scheduled_shifts|worked_shifts)\M'
    OR p.oid IN (SELECT t.tgfoid FROM pg_trigger t
                WHERE t.tgrelid IN (SELECT oid FROM seed_tables) AND NOT t.tgisinternal)
),
function_edges AS (
  -- Catalog dependencies cover tracked SQL calls; PL/pgSQL often needs text hints.
  SELECT d.objid AS caller, d.refobjid AS callee
  FROM pg_depend d
  WHERE d.classid='pg_proc'::regclass AND d.refclassid='pg_proc'::regclass
  UNION
  SELECT p.oid, q.oid FROM routines p JOIN routines q
    ON q.schema_name='public'
    AND strpos(lower(p.prosrc),lower(q.proname))>0
    AND p.oid<>q.oid
),
function_scope(oid) AS (
  SELECT oid FROM seed_functions
  UNION
  SELECT e.callee FROM function_scope s JOIN function_edges e ON e.caller=s.oid
),
selected_functions AS (
  SELECT p.* FROM routines p JOIN function_scope s ON s.oid=p.oid
),
table_scope AS (
  SELECT oid FROM seed_tables
  UNION
  -- Find nonstandard exclusion storage referenced by occurrence/generation RPCs.
  SELECT r.oid FROM relations r
  WHERE EXISTS (
    SELECT 1 FROM selected_functions p
    WHERE p.proname ~* '(schedule|occurrence)'
      AND (r.relname ~* '(exclu|occurrence|exception|cancel)'
           OR EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=r.oid
                      AND a.attname='class_id' AND NOT a.attisdropped))
      AND strpos(lower(p.prosrc),lower(r.relname))>0
  )
),
roles AS (
  SELECT oid,rolname,rolsuper,rolbypassrls,rolcanlogin FROM pg_roles
),
function_report AS (
  SELECT p.oid, jsonb_build_object(
    'schema',p.schema_name,'name',p.proname,'identity_arguments',p.arguments,
    'definition',p.definition,'owner',pg_get_userbyid(p.proowner),
    'security',CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END,
    'language',(SELECT lanname FROM pg_language WHERE oid=p.prolang),
    'search_path', (SELECT jsonb_agg(v) FROM unnest(p.proconfig) v
                    WHERE v LIKE 'search_path=%'),
    'search_path_explicit',EXISTS(SELECT 1 FROM unnest(p.proconfig) v WHERE v LIKE 'search_path=%'),
    'public_execute',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
                            WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),
    'effective_execute_roles',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'role',r.rolname,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,
      'can_login',r.rolcanlogin) ORDER BY r.rolname),'[]'::jsonb)
      FROM roles r WHERE has_function_privilege(r.oid,p.oid,'EXECUTE')),
    'discovery_only_hints',jsonb_build_object(
      'mentions_active',p.prosrc ~* '\mactive\M',
      'mentions_confirmed',p.prosrc ~* '\mconfirmed\M',
      'mentions_submitted',p.prosrc ~* '\msubmitted\M',
      'mentions_paid',p.prosrc ~* '\mpaid\M',
      'mentions_actual_or_worked_link',p.prosrc ~* '(actual_shift_id|worked_shift|scheduled_shift_id)',
      'mentions_date_boundary',p.prosrc ~* '(current_date|now\s*\(|effective_from|p_from_date)',
      'mentions_conflict_handling',p.prosrc ~* '(on\s+conflict|not\s+exists)',
      'mentions_exclusion',p.prosrc ~* '(exclu|removed|exception)',
      'mentions_dynamic_execute',p.prosrc ~* '\mexecute\M'
    )
  ) AS item FROM selected_functions p
),
table_report AS (
  SELECT jsonb_build_object(
    'schema',r.schema_name,'table',r.relname,'kind',r.relkind,
    'rls_enabled',r.relrowsecurity,'rls_forced',r.relforcerowsecurity,
    'owner',pg_get_userbyid(r.relowner),
    'columns',(SELECT jsonb_agg(jsonb_build_object(
      'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
      'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated
    ) ORDER BY a.attnum) FROM pg_attribute a
      WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped),
    'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
      'roles',(SELECT jsonb_agg(CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END)
               FROM unnest(p.polroles) role_id),
      'using',pg_get_expr(p.polqual,p.polrelid),
      'with_check',pg_get_expr(p.polwithcheck,p.polrelid)
    ) ORDER BY p.polname),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid=r.oid),
    'effective_table_privileges',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'role',u.rolname,'privileges',v.privileges) ORDER BY u.rolname),'[]'::jsonb)
      FROM roles u CROSS JOIN LATERAL (
        SELECT jsonb_agg(x) AS privileges FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) x
        WHERE has_table_privilege(u.oid,r.oid,x)
      ) v WHERE v.privileges IS NOT NULL),
    'effective_column_privileges',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'role',u.rolname,'column',a.attname,'privileges',v.privileges)
      ORDER BY u.rolname,a.attnum),'[]'::jsonb)
      FROM roles u CROSS JOIN pg_attribute a CROSS JOIN LATERAL (
        SELECT jsonb_agg(x) AS privileges FROM unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) x
        WHERE has_column_privilege(u.oid,r.oid,a.attnum,x)
      ) v WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped AND v.privileges IS NOT NULL),
    'table_acl',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
      'privilege',a.privilege_type,'grantable',a.is_grantable)),'[]'::jsonb)
      FROM aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) a),
    'explicit_column_acl',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'column',c.attname,'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
      'privilege',a.privilege_type,'grantable',a.is_grantable)),'[]'::jsonb)
      FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a
      WHERE c.attrelid=r.oid AND c.attnum>0 AND NOT c.attisdropped)
  ) AS item FROM relations r JOIN table_scope s ON s.oid=r.oid
),
constraints_report AS (
  SELECT c.*,jsonb_build_object(
    'name',c.conname,'table',c.conrelid::regclass::text,'type',c.contype,
    'references',CASE WHEN c.confrelid<>0 THEN c.confrelid::regclass::text END,
    'definition',pg_get_constraintdef(c.oid,true),'validated',c.convalidated,
    'deferrable',c.condeferrable,'initially_deferred',c.condeferred,
    'delete_action',CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END,
    'update_action',CASE c.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END
  ) AS item FROM pg_constraint c
  WHERE c.conrelid IN (SELECT oid FROM table_scope) OR c.confrelid IN (SELECT oid FROM table_scope)
),
cascade_paths(oid,path) AS (
  SELECT to_regclass('public.class_staffing_slots')::oid,
         ARRAY[to_regclass('public.class_staffing_slots')::oid]
  WHERE to_regclass('public.class_staffing_slots') IS NOT NULL
  UNION ALL
  SELECT c.conrelid,p.path||c.conrelid FROM cascade_paths p JOIN pg_constraint c
    ON c.confrelid=p.oid AND c.contype='f' AND c.confdeltype='c'
  WHERE NOT c.conrelid=ANY(p.path)
),
checks AS (
  SELECT
    NOT EXISTS(SELECT 1 FROM wanted w WHERE NOT EXISTS(
      SELECT 1 FROM selected_functions p WHERE p.schema_name='public' AND p.proname=w.name)) AS all_named_functions_present,
    NOT EXISTS(SELECT 1 FROM (VALUES ('classes'),('class_profiles'),('class_staffing_slots'),('scheduled_shifts')) x(name)
      WHERE to_regclass('public.'||x.name) IS NULL) AS core_tables_present,
    CASE WHEN to_regclass('public.class_staffing_slots') IS NULL THEN NULL ELSE EXISTS(
      SELECT 1 FROM cascade_paths p WHERE cardinality(p.path)>1
      AND p.oid IN (to_regclass('public.scheduled_shifts'),to_regclass('public.worked_shifts'),to_regclass('public.shifts')))
    END AS slot_delete_has_fk_cascade_path_to_shift
)
SELECT jsonb_build_object(
  'scope','Classes / Master Timetable catalog verification; no record contents',
  'read_only',true,
  'limitations',jsonb_build_array(
    'Full definitions are source code: review before sharing if custom code embeds credentials or literals.',
    'Discovery includes target-table references and transitive helper hints; dynamic SQL and external routines may be missed.',
    'Effective privileges reflect current role inheritance/PUBLIC/ownership/superuser; SET ROLE possibilities are not enumerated.',
    'Missing copy_schedule_month may be explained by clone_schedule_month; missing definitions never count as safe.',
    'NULL safety results mean unverified; keywords cannot prove guards, idempotency or exclusion behaviour.'),
  'expected_functions',(SELECT jsonb_agg(jsonb_build_object('name',w.name,
    'present',EXISTS(SELECT 1 FROM selected_functions p WHERE p.schema_name='public' AND p.proname=w.name)) ORDER BY w.name) FROM wanted w),
  'expected_tables',(SELECT jsonb_agg(jsonb_build_object('name',name,'present',to_regclass('public.'||name) IS NOT NULL) ORDER BY name) FROM base_names),
  'functions',(SELECT coalesce(jsonb_agg(item ORDER BY oid),'[]'::jsonb) FROM function_report),
  'tables',(SELECT coalesce(jsonb_agg(item),'[]'::jsonb) FROM table_report),
  'constraints',(SELECT coalesce(jsonb_agg(item ORDER BY conrelid,conname),'[]'::jsonb) FROM constraints_report),
  'indexes',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'table',i.indrelid::regclass::text,'definition',pg_get_indexdef(i.indexrelid),
    'unique',i.indisunique,'valid',i.indisvalid,'ready',i.indisready,
    'predicate',pg_get_expr(i.indpred,i.indrelid)) ORDER BY i.indexrelid),'[]'::jsonb)
    FROM pg_index i WHERE i.indrelid IN (SELECT oid FROM table_scope)),
  'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'table',t.tgrelid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,
    'internal',t.tgisinternal,'definition',pg_get_triggerdef(t.oid,true),
    'function',t.tgfoid::regprocedure::text,
    'function_definition',CASE WHEN NOT t.tgisinternal THEN pg_get_functiondef(t.tgfoid) END)
    ORDER BY t.tgrelid,t.tgname),'[]'::jsonb) FROM pg_trigger t
    WHERE t.tgrelid IN (SELECT oid FROM table_scope)
       OR t.tgfoid IN (SELECT oid FROM function_scope)),
  'exclusion_storage_candidates',(SELECT coalesce(jsonb_agg(r.relname),'[]'::jsonb)
    FROM relations r JOIN table_scope s ON s.oid=r.oid
    WHERE r.relname ~* '(exclu|occurrence|exception|cancel)'),
  'catalog_checks',(SELECT to_jsonb(c) FROM checks c),
  'semantic_safety_checks',jsonb_build_object(
    'past_shifts_immutable',NULL,'confirmed_shifts_immutable',NULL,
    'submitted_timesheets_protected',NULL,'paid_timesheets_protected',NULL,
    'linked_worked_shifts_protected',NULL,'generation_excludes_inactive',NULL,
    'generation_idempotent',NULL,'sync_has_enforced_date_cutoff',NULL,
    'removed_occurrences_survive_regeneration',NULL,
    'slot_deletion_cannot_modify_shift_history',NULL),
  'passed_for_classes_phase_1',false,
  'assessment','NOT CLEARED: review deployed definitions, all mutation paths and concurrency guards. Catalog presence and text hints alone cannot certify Phase 1 safety.'
) AS classes_master_timetable_verification;
