-- Version 1.1 Sprint 1 — Staffing Intelligence settings
-- Apply after v1_0_1_intelligent_staffing_foundation.sql.
begin;

do $preflight$
begin
  if to_regclass('public.staffing_recommendation_settings') is null then
    raise exception using errcode='P0001', message='Staffing Intelligence preflight failed: public.staffing_recommendation_settings is missing';
  end if;
end
$preflight$;

alter table public.staffing_recommendation_settings
  add column if not exists mandatory_rules jsonb not null default '{"coach_available":"critical","recommended_qualification":"warning","coaching_capability":"warning","weekly_hours_limit":"warning"}'::jsonb;
alter table public.staffing_recommendation_settings
  add column if not exists criteria jsonb not null default '{"availability":{"weight":35,"behaviour":"score"},"previous_coach":{"weight":20,"behaviour":"score"},"lower_staffing_cost":{"weight":10,"behaviour":"score"},"recommended_qualification":{"weight":0,"behaviour":"threshold"}}'::jsonb;
alter table public.staffing_recommendation_settings
  add column if not exists priority_order jsonb not null default '["availability","previous_coach","lower_staffing_cost","recommended_qualification"]'::jsonb;

alter table public.staffing_recommendation_settings
  alter column criteria set default '{"availability":{"weight":35,"behaviour":"score"},"previous_coach":{"weight":20,"behaviour":"score"},"lower_staffing_cost":{"weight":10,"behaviour":"score"},"recommended_qualification":{"weight":0,"behaviour":"threshold"}}'::jsonb;
alter table public.staffing_recommendation_settings
  alter column priority_order set default '["availability","previous_coach","lower_staffing_cost","recommended_qualification"]'::jsonb;

do $compatibility$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='staffing_recommendation_settings'
      and column_name in ('mandatory_rules','criteria','priority_order') and data_type<>'jsonb'
  ) then
    raise exception using errcode='P0001', message='Staffing Intelligence compatibility check failed: configuration columns must be jsonb';
  end if;
end
$compatibility$;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.staffing_recommendation_settings'::regclass
      and conname='staffing_settings_configuration_shapes'
  ) then
    alter table public.staffing_recommendation_settings
      add constraint staffing_settings_configuration_shapes check (
        jsonb_typeof(mandatory_rules)='object'
        and jsonb_typeof(criteria)='object'
        and jsonb_typeof(priority_order)='array'
      ) not valid;
  end if;
end
$constraints$;
alter table public.staffing_recommendation_settings validate constraint staffing_settings_configuration_shapes;

-- Keep the singleton row available without replacing any existing configuration.
insert into public.staffing_recommendation_settings(id) values(1) on conflict(id) do nothing;

-- Retain administrator choices for active criteria while removing criteria that
-- are no longer part of the recommendation flow.
update public.staffing_recommendation_settings settings
set criteria=settings.criteria-'organisation_match'-'weekly_hours',
    priority_order=coalesce((
      select jsonb_agg(item.value order by item.ordinality)
      from jsonb_array_elements(settings.priority_order) with ordinality as item(value,ordinality)
      where item.value #>> '{}' not in ('organisation_match','weekly_hours')
    ),'[]'::jsonb),
    priorities=settings.priorities-'organisation_match'-'weekly_hours'
where settings.id=1;

notify pgrst,'reload schema';
commit;
