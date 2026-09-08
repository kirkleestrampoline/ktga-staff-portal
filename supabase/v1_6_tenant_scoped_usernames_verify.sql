-- Read-only verification: returns exactly one row and one JSON value.
with checks as(
  select
    not exists(
      select 1 from public.profiles
      where username is not null and btrim(username)<>''
      group by club_id,lower(btrim(username)) having count(*)>1
    ) as no_same_club_username_duplicates,
    exists(
      select 1 from pg_index
      where indexrelid=to_regclass('public.profiles_club_username_normalised_uidx')
        and indisunique and indisvalid
    ) as tenant_username_index_valid,
    not exists(
      select 1 from pg_index i
      where i.indrelid='public.profiles'::regclass
        and i.indisunique and not i.indisprimary
        and position('username' in lower(pg_get_indexdef(i.indexrelid)))>0
        and position('club_id' in lower(pg_get_indexdef(i.indexrelid)))=0
    ) as no_global_username_unique_index,
    not exists(select 1 from public.profiles where club_id is null) as all_profiles_assigned,
    not exists(
      select 1 from public.profiles p left join public.clubs c on c.id=p.club_id
      where c.id is null
    ) as all_profile_clubs_exist,
    not exists(
      select 1 from public.clubs group by lower(btrim(slug)) having count(*)>1
    ) as club_codes_case_insensitively_unique,
    exists(
      select 1 from pg_index
      where indexrelid=to_regclass('public.clubs_slug_normalised_uidx')
        and indisunique and indisvalid
    ) as club_code_index_valid
), report as(
  select *,(
    no_same_club_username_duplicates and tenant_username_index_valid
    and no_global_username_unique_index and all_profiles_assigned
    and all_profile_clubs_exist and club_codes_case_insensitively_unique
    and club_code_index_valid
  ) as tenant_username_migration_complete
  from checks
)
select jsonb_build_object(
  'read_only',true,
  'tenant_username_migration_complete',tenant_username_migration_complete,
  'checks',jsonb_build_object(
    'no_same_club_username_duplicates',no_same_club_username_duplicates,
    'tenant_username_index_valid',tenant_username_index_valid,
    'no_global_username_unique_index',no_global_username_unique_index,
    'all_profiles_assigned',all_profiles_assigned,
    'all_profile_clubs_exist',all_profile_clubs_exist,
    'club_codes_case_insensitively_unique',club_codes_case_insensitively_unique,
    'club_code_index_valid',club_code_index_valid
  ),
  'clubs',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'slug',slug,'active',active) order by name),'[]'::jsonb) from public.clubs),
  'cross_club_reused_usernames',(select coalesce(jsonb_agg(jsonb_build_object('username',normalised_username,'club_count',club_count) order by normalised_username),'[]'::jsonb) from(
    select lower(btrim(username)) normalised_username,count(distinct club_id) club_count
    from public.profiles where username is not null and btrim(username)<>''
    group by lower(btrim(username)) having count(distinct club_id)>1
  ) reused)
) as tenant_username_verification
from report;
