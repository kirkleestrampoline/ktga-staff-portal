-- AV Gymnastics Solutions V1.1.1 final launch fixes
-- Safe to run after the V1.1 launch migration.

begin;

-- Allow the server-side Supabase service role used by the Invite Coach route
-- to set role/is_active/hourly_rate on a newly invited account.
create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' and not public.is_global_admin() then
    new.role:=old.role;
    new.email:=old.email;
    if auth.uid()=old.id then
      new.hourly_rate:=old.hourly_rate;
      new.is_active:=old.is_active;
    end if;
  end if;
  return new;
end;
$$;

-- Reopening is deliberately allowed even after a month has been marked paid.
-- It removes the generated invoices and returns the month to draft so an admin
-- can correct it and submit it again.
create or replace function public.admin_reopen_timesheet(p_timesheet_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare cid uuid;
begin
  select coach_id into cid from public.timesheets where id=p_timesheet_id;
  if not public.can_manage_profile(cid) then raise exception 'No permission'; end if;

  delete from public.invoices where timesheet_id=p_timesheet_id;
  update public.timesheets
  set status='draft',
      submitted_at=null,
      submitted_by=null,
      paid_at=null,
      updated_at=now()
  where id=p_timesheet_id;
end;
$$;

grant execute on function public.admin_reopen_timesheet(uuid) to authenticated;

commit;
