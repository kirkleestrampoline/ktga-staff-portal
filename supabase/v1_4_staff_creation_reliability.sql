-- Version 1.4 — Staff Creation Reliability
-- Apply after the Club Architecture and username-first authentication migrations.
-- Do not execute automatically.
begin;

do $preflight$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.clubs') is null then
    raise exception using errcode='P0001',message='Staff creation reliability preflight failed: profiles or clubs is missing';
  end if;
  if exists(
    select 1 from (values
      ('club_id','uuid'),('username','text'),('contact_email','text'),('auth_email','text')
    ) expected(name,type)
    where not exists(
      select 1 from information_schema.columns actual
      where actual.table_schema='public' and actual.table_name='profiles'
        and actual.column_name=expected.name and actual.data_type=expected.type
    )
  ) then
    raise exception using errcode='P0001',message='Staff creation reliability requires the current club-aware username-first profile schema';
  end if;
end
$preflight$;

-- GoTrue may apply custom app_metadata after auth.users has fired its INSERT
-- triggers. This server-only handoff gives the trigger the already-authorised
-- tenant without accepting a club identifier from a browser signup.
create table if not exists public.pending_auth_user_clubs(
  auth_email text primary key,
  club_id uuid not null references public.clubs(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '10 minutes',
  constraint pending_auth_user_clubs_email_valid check(btrim(auth_email)<>''),
  constraint pending_auth_user_clubs_expiry_valid check(expires_at>created_at)
);
alter table public.pending_auth_user_clubs enable row level security;
revoke all on public.pending_auth_user_clubs from public,anon,authenticated;

-- Auth trigger execution has no caller profile, so current_club_id() cannot be
-- used while auth.users is being inserted. The server-side staff creation route
-- supplies the authorised actor's club in protected Auth app_metadata instead.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $function$
declare
  target_club_id uuid;
  provisioned_club_id uuid;
  contact_email text;
begin
  begin
    target_club_id:=nullif(new.raw_app_meta_data->>'club_id','')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='22023',message='Auth user has an invalid club identifier';
  end;

  select club_id into provisioned_club_id
  from public.pending_auth_user_clubs
  where auth_email=lower(new.email) and expires_at>now()
  for update;

  if target_club_id is not null and provisioned_club_id is not null and target_club_id<>provisioned_club_id then
    raise exception using errcode='42501',message='Auth user club assignment does not match server provisioning';
  end if;
  target_club_id:=coalesce(target_club_id,provisioned_club_id);

  if target_club_id is null or not exists(select 1 from public.clubs where id=target_club_id) then
    raise exception using errcode='23503',message='Auth user must be assigned to an existing club';
  end if;

  contact_email:=nullif(lower(btrim(coalesce(new.raw_user_meta_data->>'contact_email',''))),'');
  insert into public.profiles(id,club_id,full_name,email,contact_email,auth_email,username)
  values(
    new.id,
    target_club_id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    contact_email,
    contact_email,
    new.email,
    nullif(lower(btrim(coalesce(new.raw_user_meta_data->>'username',''))),'')
  )
  on conflict(id) do nothing;
  delete from public.pending_auth_user_clubs where auth_email=lower(new.email);
  return new;
end
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public;
notify pgrst,'reload schema';
commit;
