-- Version 1.4 — Approved Expenses on Staff Invoices
-- Apply after v1_4_expenses_management.sql. Do not execute automatically.
begin;

do $preflight$
begin
  if to_regclass('public.expenses') is null or to_regclass('public.invoices') is null
     or to_regclass('public.timesheets') is null then
    raise exception using errcode='P0001',message='Invoice expense integration preflight failed: expenses, invoices or timesheets is missing';
  end if;
end
$preflight$;

alter table public.invoices add column if not exists work_amount numeric(12,2);
alter table public.invoices add column if not exists expense_amount numeric(12,2);
update public.invoices set
  work_amount=coalesce(work_amount,total_amount),
  expense_amount=coalesce(expense_amount,0)
where work_amount is null or expense_amount is null;
alter table public.invoices alter column work_amount set default 0;
alter table public.invoices alter column work_amount set not null;
alter table public.invoices alter column expense_amount set default 0;
alter table public.invoices alter column expense_amount set not null;

create table if not exists public.invoice_expense_lines(
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null,
  expense_id uuid,
  expense_date date not null,
  category text not null,
  description text not null,
  amount numeric(12,2) not null,
  miles numeric(10,2),
  mileage_rate numeric(10,2),
  journey_from text,
  journey_to text,
  created_at timestamptz not null default now(),
  constraint invoice_expense_lines_amount_valid check(amount>0)
);

do $constraints$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.invoice_expense_lines'::regclass and conname='invoice_expense_lines_invoice_fk') then
    alter table public.invoice_expense_lines add constraint invoice_expense_lines_invoice_fk
      foreign key(invoice_id) references public.invoices(id) on delete cascade not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.invoice_expense_lines'::regclass and conname='invoice_expense_lines_expense_fk') then
    alter table public.invoice_expense_lines add constraint invoice_expense_lines_expense_fk
      foreign key(expense_id) references public.expenses(id) on delete set null not valid;
  end if;
end
$constraints$;
alter table public.invoice_expense_lines validate constraint invoice_expense_lines_invoice_fk;
alter table public.invoice_expense_lines validate constraint invoice_expense_lines_expense_fk;
create unique index if not exists invoice_expense_lines_expense_unique
  on public.invoice_expense_lines(expense_id) where expense_id is not null;
create index if not exists invoice_expense_lines_invoice_idx on public.invoice_expense_lines(invoice_id);

alter table public.invoice_expense_lines enable row level security;
drop policy if exists invoice_expense_lines_read on public.invoice_expense_lines;
create policy invoice_expense_lines_read on public.invoice_expense_lines for select to authenticated using(
  exists(
    select 1 from public.invoices invoice
    where invoice.id=invoice_id and invoice.club_id=public.current_club_id()
      and (invoice.coach_id=auth.uid() or exists(
        select 1 from public.profiles actor where actor.id=auth.uid()
          and actor.club_id=invoice.club_id and actor.is_active=true
          and actor.role in ('org_admin','admin','club_owner')
      ))
  )
);
grant select on public.invoice_expense_lines to authenticated;

-- Preserve the established submission workflow while snapshotting approved
-- reimbursements. Club-level expenses are attached once to the first invoice
-- for the payroll submission; if there is no work, an expense-only invoice is
-- created so volunteers and salaried staff can still be reimbursed.
create or replace function public.build_timesheet_invoices(p_coach uuid,p_month date,p_actor uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $function$
declare
  tsid uuid;rate numeric(10,2);coachpref text;rec record;invno text;
  created_invoice_id uuid;expense_invoice_id uuid;eligible_expense_total numeric(12,2);
begin
  p_month:=date_trunc('month',p_month)::date;
  select hourly_rate,coalesce(nullif(invoice_prefix,''),upper(left(regexp_replace(full_name,'[^A-Za-z0-9]','','g'),3)))
    into rate,coachpref from public.profiles where id=p_coach and is_active=true;
  if rate is null then raise exception 'Staff profile is not active'; end if;

  select round(coalesce(sum(expense.amount),0),2) into eligible_expense_total
  from public.expenses expense
  where expense.profile_id=p_coach and expense.club_id=public.current_club_id()
    and expense.status='approved' and expense.expense_date>=p_month
    and expense.expense_date<(p_month+interval '1 month')::date
    and not exists(select 1 from public.invoice_expense_lines line where line.expense_id=expense.id);

  if not exists(select 1 from public.shifts where coach_id=p_coach and shift_date>=p_month and shift_date<(p_month+interval '1 month')::date)
     and eligible_expense_total<=0 then
    raise exception 'Add at least one valid shift or approved expense before submitting';
  end if;
  if exists(select 1 from public.shifts where coach_id=p_coach and shift_date>=p_month and shift_date<(p_month+interval '1 month')::date and venue_id is null)
    then raise exception 'Every shift needs an organisation before submission'; end if;

  insert into public.timesheets(coach_id,month_start,status,submitted_at,paid_at,submitted_by)
  values(p_coach,p_month,'submitted',now(),null,p_actor)
  on conflict(coach_id,month_start) do update
    set status='submitted',submitted_at=now(),paid_at=null,submitted_by=p_actor,updated_at=now()
  returning id into tsid;

  delete from public.invoices where timesheet_id=tsid;

  for rec in
    select s.venue_id,
      round(sum(greatest(0,extract(epoch from((s.shift_date+s.finish_time+case when s.finish_time<s.start_time then interval '1 day' else interval '0 day' end)-(s.shift_date+s.start_time)))/3600.0-s.break_minutes/60.0))::numeric,2) hrs,
      coalesce(nullif(v.invoice_prefix,''),upper(left(regexp_replace(v.name,'[^A-Za-z0-9]','','g'),4))) orgpref
    from public.shifts s join public.venues v on v.id=s.venue_id
    where s.coach_id=p_coach and s.shift_date>=p_month and s.shift_date<(p_month+interval '1 month')::date
    group by s.venue_id,v.invoice_prefix,v.name
    order by s.venue_id
  loop
    invno:=coalesce(coachpref,'INV')||'-'||coalesce(rec.orgpref,'ORG')||'-'||to_char(p_month,'YYYYMM');
    insert into public.invoices(coach_id,timesheet_id,venue_id,invoice_number,invoice_date,hours,hourly_rate,work_amount,expense_amount,total_amount,status)
    values(p_coach,tsid,rec.venue_id,invno,current_date,rec.hrs,rate,round(rec.hrs*rate,2),0,round(rec.hrs*rate,2),'awaiting_payment')
    returning id into created_invoice_id;
    if expense_invoice_id is null then expense_invoice_id:=created_invoice_id; end if;
  end loop;

  if eligible_expense_total>0 and expense_invoice_id is null then
    invno:=coalesce(coachpref,'INV')||'-EXP-'||to_char(p_month,'YYYYMM');
    insert into public.invoices(coach_id,timesheet_id,venue_id,invoice_number,invoice_date,hours,hourly_rate,work_amount,expense_amount,total_amount,status)
    values(p_coach,tsid,null,invno,current_date,0,rate,0,0,0,'awaiting_payment')
    returning id into expense_invoice_id;
  end if;

  if expense_invoice_id is not null then
    insert into public.invoice_expense_lines(
      invoice_id,expense_id,expense_date,category,description,amount,miles,mileage_rate,journey_from,journey_to
    )
    select expense_invoice_id,expense.id,expense.expense_date,expense.category,expense.description,
      expense.amount,expense.miles,expense.mileage_rate,expense.journey_from,expense.journey_to
    from public.expenses expense
    where expense.profile_id=p_coach and expense.club_id=public.current_club_id()
      and expense.status='approved' and expense.expense_date>=p_month
      and expense.expense_date<(p_month+interval '1 month')::date
      and not exists(select 1 from public.invoice_expense_lines line where line.expense_id=expense.id)
    order by expense.expense_date,expense.id;

    update public.invoices invoice set
      expense_amount=coalesce((select round(sum(line.amount),2) from public.invoice_expense_lines line where line.invoice_id=invoice.id),0),
      total_amount=invoice.work_amount+coalesce((select round(sum(line.amount),2) from public.invoice_expense_lines line where line.invoice_id=invoice.id),0)
    where invoice.id=expense_invoice_id;
  end if;
  return tsid;
end
$function$;
revoke all on function public.build_timesheet_invoices(uuid,date,uuid) from public;

-- Mark only reimbursements snapshotted onto the invoices being paid.
create or replace function public.admin_mark_payroll_paid(p_timesheet_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $function$
declare expense_id uuid;
begin
  if not exists(select 1 from public.timesheets where id=p_timesheet_id) then
    raise exception using errcode='P0002',message='Timesheet not found';
  end if;
  perform public.admin_mark_timesheet_paid(p_timesheet_id);
  for expense_id in
    select line.expense_id
    from public.invoice_expense_lines line
    join public.invoices invoice on invoice.id=line.invoice_id
    join public.expenses expense on expense.id=line.expense_id
    where invoice.timesheet_id=p_timesheet_id and expense.status='approved'
      and expense.club_id=public.current_club_id() and line.expense_id is not null
    for update of expense
  loop
    perform public.review_expense(expense_id,'paid',null);
  end loop;
end
$function$;
revoke all on function public.admin_mark_payroll_paid(uuid) from public;
grant execute on function public.admin_mark_payroll_paid(uuid) to authenticated;

create or replace function public.admin_mark_invoice_paid(p_invoice_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $function$
declare vid uuid;tsid uuid;expense_id uuid;
begin
  select venue_id,timesheet_id into vid,tsid from public.invoices where id=p_invoice_id for update;
  if not found then raise exception using errcode='P0002',message='Invoice not found'; end if;
  if not public.is_global_admin() and (vid is null or not public.is_venue_admin(vid)) then raise exception 'No permission'; end if;
  update public.invoices set status='paid' where id=p_invoice_id and status='awaiting_payment';
  for expense_id in
    select line.expense_id from public.invoice_expense_lines line
    join public.expenses expense on expense.id=line.expense_id
    where line.invoice_id=p_invoice_id and expense.status='approved'
      and expense.club_id=public.current_club_id() and line.expense_id is not null
    for update of expense
  loop
    perform public.review_expense(expense_id,'paid',null);
  end loop;
  if not exists(select 1 from public.invoices where timesheet_id=tsid and status<>'paid') then
    update public.timesheets set status='paid',paid_at=now(),updated_at=now() where id=tsid;
  end if;
end
$function$;
revoke all on function public.admin_mark_invoice_paid(uuid) from public;
grant execute on function public.admin_mark_invoice_paid(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
