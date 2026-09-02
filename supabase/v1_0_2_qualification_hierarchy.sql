-- v1.0.2 — Qualification hierarchy and inactive qualification safeguards
-- Apply after v1_0_1_intelligent_staffing_foundation.sql.
begin;

do $preflight$
begin
  if to_regclass('public.qualification_types') is null then
    raise exception using errcode='P0001', message='Qualification hierarchy preflight failed: public.qualification_types is missing';
  end if;
end
$preflight$;

alter table public.qualification_types add column if not exists qualification_family text;
alter table public.qualification_types add column if not exists qualification_level integer;

do $compatibility$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='qualification_types'
      and column_name='qualification_family' and data_type='text'
  ) then
    raise exception using errcode='P0001', message='Qualification hierarchy compatibility check failed: qualification_types.qualification_family must be text';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='qualification_types'
      and column_name='qualification_level' and data_type='integer'
  ) then
    raise exception using errcode='P0001', message='Qualification hierarchy compatibility check failed: qualification_types.qualification_level must be integer';
  end if;
end
$compatibility$;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.qualification_types'::regclass
      and conname='qualification_types_hierarchy_valid'
  ) then
    alter table public.qualification_types
      add constraint qualification_types_hierarchy_valid
      check (
        qualification_level is null
        or (
          qualification_level > 0
          and qualification_family is not null
          and btrim(qualification_family)<>''
        )
      ) not valid;
  end if;
end
$constraints$;
alter table public.qualification_types validate constraint qualification_types_hierarchy_valid;

do $duplicates$
begin
  if exists (
    select 1
    from public.qualification_types
    where active=true and qualification_family is not null and btrim(qualification_family)<>'' and qualification_level is not null
    group by lower(btrim(qualification_family)), qualification_level
    having count(*)>1
  ) then
    raise exception using errcode='23505', message='Duplicate qualification levels exist within a qualification family; reconcile them before applying v1.0.2';
  end if;
end
$duplicates$;

-- Remove the earlier draft index if this file was partially applied. It also
-- constrained inactive rows, which should remain archivable/restorable data.
drop index if exists public.qualification_types_family_level_unique;
create unique index if not exists qualification_types_active_family_level_unique
  on public.qualification_types(lower(btrim(qualification_family)),qualification_level)
  where active=true and qualification_family is not null and btrim(qualification_family)<>'' and qualification_level is not null;
create index if not exists qualification_types_family_sort_idx
  on public.qualification_types(lower(btrim(qualification_family)),qualification_level desc)
  where qualification_family is not null and btrim(qualification_family)<>'';

notify pgrst,'reload schema';
commit;
