-- Version 1.4 — Expenses Management System
-- Apply after Version 1.3 migrations. Do not execute automatically.
begin;

do $preflight$
begin
  if to_regclass('public.clubs') is null or to_regclass('public.profiles') is null then
    raise exception using errcode='P0001',message='Expenses preflight failed: clubs or profiles is missing';
  end if;
end
$preflight$;

alter table public.clubs add column if not exists mileage_rate numeric(10,2);
update public.clubs set mileage_rate=0.45 where mileage_rate is null;
alter table public.clubs alter column mileage_rate set default 0.45;
alter table public.clubs alter column mileage_rate set not null;

create table if not exists public.expenses(
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null default public.current_club_id(),
  profile_id uuid not null default auth.uid(),
  category text not null,
  status text not null default 'draft',
  expense_date date not null,
  description text not null,
  notes text,
  amount numeric(12,2) not null,
  miles numeric(10,2),
  mileage_rate numeric(10,2),
  journey_from text,
  journey_to text,
  supplier text,
  course_name text,
  receipt_url text,
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  paid_by uuid,
  paid_at timestamptz,
  shift_id uuid,
  competition_id uuid,
  project_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_category_valid check(category in ('mileage','parking','food_drink','accommodation','travel','equipment','training_cpd','other')),
  constraint expenses_status_valid check(status in ('draft','submitted','approved','rejected','paid')),
  constraint expenses_values_valid check(
    btrim(description)<>'' and amount>0
    and (category<>'mileage' or (miles>0 and mileage_rate>=0 and btrim(journey_from)<>'' and btrim(journey_to)<>'' and amount=round(miles*mileage_rate,2)))
  )
);

do $constraints$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.expenses'::regclass and conname='expenses_club_fk') then
    alter table public.expenses add constraint expenses_club_fk foreign key(club_id) references public.clubs(id) on delete restrict not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.expenses'::regclass and conname='expenses_profile_fk') then
    alter table public.expenses add constraint expenses_profile_fk foreign key(profile_id) references public.profiles(id) on delete restrict not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.expenses'::regclass and conname='expenses_approved_by_fk') then
    alter table public.expenses add constraint expenses_approved_by_fk foreign key(approved_by) references public.profiles(id) on delete set null not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.expenses'::regclass and conname='expenses_paid_by_fk') then
    alter table public.expenses add constraint expenses_paid_by_fk foreign key(paid_by) references public.profiles(id) on delete set null not valid;
  end if;
end
$constraints$;
alter table public.expenses validate constraint expenses_club_fk;
alter table public.expenses validate constraint expenses_profile_fk;
alter table public.expenses validate constraint expenses_approved_by_fk;
alter table public.expenses validate constraint expenses_paid_by_fk;

create index if not exists expenses_club_status_date_idx on public.expenses(club_id,status,expense_date desc);
create index if not exists expenses_profile_date_idx on public.expenses(profile_id,expense_date desc);

create or replace function public.expense_write_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $function$
declare actor_admin boolean;
begin
  actor_admin:=exists(select 1 from public.profiles where id=auth.uid() and club_id=coalesce(new.club_id,old.club_id) and is_active=true and role in ('org_admin','admin','club_owner'));
  if tg_op='INSERT' then
    new.club_id:=public.current_club_id();
    if not actor_admin then new.profile_id:=auth.uid(); end if;
    if new.status not in ('draft','submitted') then raise exception using errcode='42501',message='New expenses must be Draft or Submitted'; end if;
  elsif not actor_admin then
    if old.profile_id<>auth.uid() or old.club_id<>public.current_club_id() then raise exception using errcode='42501',message='Not authorised to change this expense'; end if;
    if old.status<>'draft' then raise exception using errcode='P0001',message='Submitted expenses are read-only'; end if;
    if new.status not in ('draft','submitted') then raise exception using errcode='P0001',message='A draft may only be submitted'; end if;
    new.profile_id:=old.profile_id;new.club_id:=old.club_id;
  end if;
  new.updated_at:=now();
  return new;
end
$function$;

drop trigger if exists expense_write_guard on public.expenses;
create trigger expense_write_guard before insert or update on public.expenses for each row execute function public.expense_write_guard();
revoke all on function public.expense_write_guard() from public;

create or replace function public.review_expense(p_expense_id uuid,p_action text,p_reason text default null)
returns void language plpgsql security definer set search_path=pg_catalog,public as $function$
declare item public.expenses%rowtype;
begin
  select * into item from public.expenses where id=p_expense_id for update;
  if not found or item.club_id<>public.current_club_id() or not exists(
    select 1 from public.profiles where id=auth.uid() and club_id=item.club_id and is_active=true and role in ('org_admin','admin','club_owner')
  ) then raise exception using errcode='42501',message='Not authorised to review this expense'; end if;
  if p_action='approve' and item.status='submitted' then
    update public.expenses set status='approved',approved_by=auth.uid(),approved_at=now(),rejected_reason=null where id=p_expense_id;
  elsif p_action='reject' and item.status='submitted' and btrim(coalesce(p_reason,''))<>'' then
    update public.expenses set status='rejected',rejected_reason=btrim(p_reason),approved_by=null,approved_at=null where id=p_expense_id;
  elsif p_action='request_changes' and item.status='submitted' and btrim(coalesce(p_reason,''))<>'' then
    update public.expenses set status='draft',rejected_reason=btrim(p_reason),approved_by=null,approved_at=null where id=p_expense_id;
  elsif p_action='paid' and item.status='approved' then
    update public.expenses set status='paid',paid_by=auth.uid(),paid_at=now() where id=p_expense_id;
  else raise exception using errcode='P0001',message='Invalid expense status change'; end if;
end
$function$;
revoke all on function public.review_expense(uuid,text,text) from public;
grant execute on function public.review_expense(uuid,text,text) to authenticated;

-- Complete the established payroll payment action and the approved expense
-- reimbursements included in the same employee/month as one transaction.
create or replace function public.admin_mark_payroll_paid(p_timesheet_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $function$
declare payroll_profile_id uuid;payroll_month_start date;expense_id uuid;
begin
  select coach_id,month_start into payroll_profile_id,payroll_month_start
  from public.timesheets where id=p_timesheet_id for update;
  if not found then raise exception using errcode='P0002',message='Timesheet not found'; end if;

  -- Preserve the existing timesheet/invoice authorisation and payment logic.
  perform public.admin_mark_timesheet_paid(p_timesheet_id);

  for expense_id in
    select id from public.expenses
    where profile_id=payroll_profile_id and club_id=public.current_club_id()
      and status='approved' and expense_date>=payroll_month_start
      and expense_date<(payroll_month_start+interval '1 month')::date
    for update
  loop
    perform public.review_expense(expense_id,'paid',null);
  end loop;
end
$function$;
revoke all on function public.admin_mark_payroll_paid(uuid) from public;
grant execute on function public.admin_mark_payroll_paid(uuid) to authenticated;

create or replace function public.delete_expense_as_admin(p_expense_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $function$
declare item public.expenses%rowtype;claimant_name text;actor_name text;
begin
  if btrim(coalesce(p_reason,''))='' then raise exception using errcode='P0001',message='Deletion reason is required'; end if;
  select * into item from public.expenses where id=p_expense_id for update;
  if not found or item.club_id<>public.current_club_id() or not exists(
    select 1 from public.profiles where id=auth.uid() and club_id=item.club_id and is_active=true and role in ('org_admin','admin','club_owner')
  ) then raise exception using errcode='42501',message='Not authorised to delete this expense'; end if;
  select full_name into claimant_name from public.profiles where id=item.profile_id;
  select full_name into actor_name from public.profiles where id=auth.uid();
  if to_regclass('public.audit_log') is null then raise exception using errcode='P0001',message='Expense deletion requires the audit log'; end if;
  insert into public.audit_log(actor_id,subject_id,action,entity_type,entity_id,details)
  values(auth.uid(),item.profile_id,'delete_expense','expenses',item.id,jsonb_build_object(
    'expense_id',item.id,'coach',claimant_name,'amount',item.amount,'category',item.category,
    'status_before_deletion',item.status,'deleted_by',actor_name,'deleted_at',now(),'reason',btrim(p_reason)
  ));
  delete from public.expenses where id=item.id;
end
$function$;
revoke all on function public.delete_expense_as_admin(uuid,text) from public;
grant execute on function public.delete_expense_as_admin(uuid,text) to authenticated;

alter table public.expenses enable row level security;
drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses for select to authenticated using(
  club_id=public.current_club_id() and (profile_id=auth.uid() or exists(select 1 from public.profiles where id=auth.uid() and club_id=expenses.club_id and is_active=true and role in ('org_admin','admin','club_owner')))
);
drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert to authenticated with check(club_id=public.current_club_id() and (profile_id=auth.uid() or exists(select 1 from public.profiles where id=auth.uid() and club_id=expenses.club_id and is_active=true and role in ('org_admin','admin','club_owner'))));
drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update to authenticated using(club_id=public.current_club_id() and (profile_id=auth.uid() or exists(select 1 from public.profiles where id=auth.uid() and club_id=expenses.club_id and is_active=true and role in ('org_admin','admin','club_owner')))) with check(club_id=public.current_club_id());
drop policy if exists expenses_delete_draft on public.expenses;
create policy expenses_delete_draft on public.expenses for delete to authenticated using(
  club_id=public.current_club_id() and profile_id=auth.uid() and status='draft'
);
grant select,insert,update,delete on public.expenses to authenticated;

insert into storage.buckets(id,name,public) values('expense-receipts','expense-receipts',false) on conflict(id) do update set public=false;
drop policy if exists expense_receipts_read on storage.objects;
create policy expense_receipts_read on storage.objects for select to authenticated using(bucket_id='expense-receipts' and (
  (storage.foldername(name))[2]=auth.uid()::text or
  exists(select 1 from public.expenses where receipt_url=name and profile_id=auth.uid() and club_id=public.current_club_id()) or
  exists(select 1 from public.profiles where id=auth.uid() and club_id::text=(storage.foldername(name))[1] and is_active=true and role in ('org_admin','admin','club_owner'))
));
drop policy if exists expense_receipts_write on storage.objects;
create policy expense_receipts_write on storage.objects for insert to authenticated with check(bucket_id='expense-receipts' and (storage.foldername(name))[1]=public.current_club_id()::text and (storage.foldername(name))[2]=auth.uid()::text);
drop policy if exists expense_receipts_update on storage.objects;
create policy expense_receipts_update on storage.objects for update to authenticated using(bucket_id='expense-receipts' and (storage.foldername(name))[2]=auth.uid()::text) with check(bucket_id='expense-receipts' and (storage.foldername(name))[2]=auth.uid()::text);
drop policy if exists expense_receipts_delete on storage.objects;
create policy expense_receipts_delete on storage.objects for delete to authenticated using(bucket_id='expense-receipts' and (
  (storage.foldername(name))[2]=auth.uid()::text or
  exists(select 1 from public.profiles where id=auth.uid() and club_id::text=(storage.foldername(name))[1] and is_active=true and role in ('org_admin','admin','club_owner'))
));

notify pgrst,'reload schema';
commit;
