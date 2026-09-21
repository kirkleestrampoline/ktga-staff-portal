-- PREPARED, NOT RUN. Read-only Club Overview aggregate.
begin;
set local lock_timeout='2s';
set local statement_timeout='60s';
do $preflight$
begin
 if to_regclass('public.member_families') is null or to_regclass('public.member_athletes') is null or to_regclass('public.enrolments') is null or to_regclass('public.enrolment_session_selections') is null or to_regclass('public.enrolment_status_history') is null or to_regclass('public.class_profiles') is null or to_regclass('public.classes') is null or to_regclass('public.venues') is null then raise exception 'Club Overview summary prerequisites are missing'; end if;
 if to_regprocedure('public.current_club_id()') is null or to_regprocedure('public.is_club_admin(uuid)') is null or to_regprocedure('public.attendance_effective_status(uuid,date)') is null then raise exception 'Reviewed tenant or enrolment authority is missing'; end if;
end $preflight$;

create function public.club_overview_summary(p_date date default (now() at time zone 'Europe/London')::date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $fn$
declare cid uuid:=public.current_club_id(); result jsonb;
begin
 if cid is null or auth.uid() is null or not public.is_club_admin(cid) then raise exception using errcode='42501',message='Club administrator only'; end if;
 select jsonb_build_object(
  'snapshot',jsonb_build_object(
   'active_family_accounts',(select count(*) from public.member_families f where f.club_id=cid and f.status='active'),
   'active_athletes',(select count(*) from public.member_athletes a where a.club_id=cid and a.status='active'),
   'active_enrolments',(select count(*) from public.enrolments e where e.club_id=cid and e.status='active' and p_date between e.start_date and coalesce(e.end_date,'infinity'::date)),
   'trial_enrolments',(select count(*) from public.enrolments e where e.club_id=cid and e.status='trial' and p_date between e.start_date and coalesce(e.end_date,'infinity'::date)),
   'waiting_enrolments',(select count(*) from public.enrolments e where e.club_id=cid and e.status='waiting' and p_date between e.start_date and coalesce(e.end_date,'infinity'::date)),
   'paused_enrolments',(select count(*) from public.enrolments e where e.club_id=cid and e.status='paused' and p_date between e.start_date and coalesce(e.end_date,'infinity'::date)),
   'published_class_profiles',(select count(*) from public.class_profiles p where p.club_id=cid and p.active and p.publication_status='published' and p_date between coalesce(p.start_date,p_date) and coalesce(p.end_date,'infinity'::date)),
   'active_weekly_sessions',(select count(*) from public.classes c join public.class_profiles p on p.id=c.class_profile_id and p.club_id=c.club_id where c.club_id=cid and c.active and p.active and p.publication_status='published' and p_date between coalesce(p.start_date,p_date) and coalesce(p.end_date,'infinity'::date) and p_date between coalesce(c.effective_from,p_date) and coalesce(c.effective_to,'infinity'::date))
  ),
  'today',jsonb_build_object(
   'class_sessions_today',(select count(*) from public.classes c join public.class_profiles p on p.id=c.class_profile_id and p.club_id=c.club_id where c.club_id=cid and c.active and p.active and p.publication_status='published' and c.weekday=extract(dow from p_date)::integer and p_date between coalesce(p.start_date,p_date) and coalesce(p.end_date,'infinity'::date) and p_date between coalesce(c.effective_from,p_date) and coalesce(c.effective_to,'infinity'::date)),
   'unique_athletes_expected_today',(select count(distinct e.athlete_id) from public.enrolments e join public.enrolment_session_selections s on s.enrolment_id=e.id and s.club_id=e.club_id join public.classes c on c.id=s.class_id and c.club_id=s.club_id join public.class_profiles p on p.id=c.class_profile_id and p.club_id=c.club_id where e.club_id=cid and c.active and p.active and p.publication_status='published' and c.weekday=extract(dow from p_date)::integer and p_date between s.selected_from and coalesce(s.selected_to,'infinity'::date) and p_date between coalesce(e.start_date,p_date) and coalesce(e.end_date,'infinity'::date) and public.attendance_effective_status(e.id,p_date) in ('active','trial')),
   'expected_attendances_today',(select count(*) from public.enrolments e join public.enrolment_session_selections s on s.enrolment_id=e.id and s.club_id=e.club_id join public.classes c on c.id=s.class_id and c.club_id=s.club_id join public.class_profiles p on p.id=c.class_profile_id and p.club_id=c.club_id where e.club_id=cid and c.active and p.active and p.publication_status='published' and c.weekday=extract(dow from p_date)::integer and p_date between s.selected_from and coalesce(s.selected_to,'infinity'::date) and public.attendance_effective_status(e.id,p_date) in ('active','trial')),
   'trial_athletes_expected_today',(select count(distinct e.athlete_id) from public.enrolments e join public.enrolment_session_selections s on s.enrolment_id=e.id and s.club_id=e.club_id join public.classes c on c.id=s.class_id and c.club_id=s.club_id join public.class_profiles p on p.id=c.class_profile_id and p.club_id=c.club_id where e.club_id=cid and c.active and p.active and p.publication_status='published' and c.weekday=extract(dow from p_date)::integer and p_date between s.selected_from and coalesce(s.selected_to,'infinity'::date) and public.attendance_effective_status(e.id,p_date)='trial')
  ),
  'class_rows', coalesce(
   (
    select jsonb_agg(
     jsonb_build_object(
      'class_id',c.id,
      'class_profile_id',p.id,
      'class_name',p.name,
      'weekday',c.weekday,
      'start_time',c.start_time,
      'finish_time',c.finish_time,
      'venue_name',v.name,
      'capacity',p.capacity,
      'active_places',(
       select count(distinct e.athlete_id)
       from public.enrolments e
       join public.enrolment_session_selections s on s.enrolment_id=e.id and s.club_id=e.club_id
       where e.club_id=cid and s.class_id=c.id
         and p_date between s.selected_from and coalesce(s.selected_to,'infinity'::date)
         and public.attendance_effective_status(e.id,p_date) in ('active','trial')
      ),
      'waiting_list',(
       select count(distinct e.athlete_id)
       from public.enrolments e
       join public.enrolment_session_selections s on s.enrolment_id=e.id and s.club_id=e.club_id
       where e.club_id=cid and s.class_id=c.id
         and p_date between s.selected_from and coalesce(s.selected_to,'infinity'::date)
         and public.attendance_effective_status(e.id,p_date)='waiting'
      ),
      'available_spaces',p.capacity-(
       select count(distinct e.athlete_id)
       from public.enrolments e
       join public.enrolment_session_selections s on s.enrolment_id=e.id and s.club_id=e.club_id
       where e.club_id=cid and s.class_id=c.id
         and p_date between s.selected_from and coalesce(s.selected_to,'infinity'::date)
         and public.attendance_effective_status(e.id,p_date) in ('active','trial')
      )
     )
     order by c.start_time,c.id
    )
    from public.classes c
    join public.class_profiles p on p.id=c.class_profile_id and p.club_id=c.club_id
    join public.venues v on v.id=c.venue_id and v.club_id=c.club_id
    where c.club_id=cid and c.active and p.active and p.publication_status='published'
      and p_date between coalesce(p.start_date,p_date) and coalesce(p.end_date,'infinity'::date)
      and p_date between coalesce(c.effective_from,p_date) and coalesce(c.effective_to,'infinity'::date)
   )
   ,'[]'::jsonb
  )
 ) into result;
 return result;
end $fn$;
alter function public.club_overview_summary(date) owner to postgres;
revoke all on function public.club_overview_summary(date) from public,anon,authenticated,service_role;
grant execute on function public.club_overview_summary(date) to authenticated;
commit;
