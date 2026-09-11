-- Read only; PREPARED, NOT RUN. No class records or mutations.
with expected(signature,body_md5,callable) as (values
 ('public.classes_save_profile(jsonb,jsonb)','7258be4fa5609181ee33ed9b1bede9da',false),
 ('public.classes_calendar_data(date,date)','4ac0f13084f80e094f7c5a6fa3340d60',true)
)
select e.signature,p.oid is not null present,md5(p.prosrc)=e.body_md5 reviewed_body_matches,
 p.prosecdef and p.proconfig @> array['search_path=pg_catalog, public'] context_correct,
 has_function_privilege('authenticated',p.oid,'EXECUTE')=e.callable authenticated_correct,
 not has_function_privilege('anon',p.oid,'EXECUTE') anonymous_blocked,
 not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public_blocked
 from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature);
