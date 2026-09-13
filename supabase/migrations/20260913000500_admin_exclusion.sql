-- Serialize eligibility changes and participation on the recipient's profile row.
create function private.lock_participant(target_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.profiles where id=target_user for update;
  if not found or exists(select 1 from private.admin_memberships where user_id=target_user) then
    raise exception 'Only non-admin users can participate' using errcode='42501';
  end if;
end;
$$;
create function private.guard_participant_insert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_participant(new.user_id);
  return new;
end;
$$;
create trigger non_admin_assignment before insert on public.survey_assignments
for each row execute function private.guard_participant_insert();
create trigger non_admin_target before insert on public.survey_push_targets
for each row execute function private.guard_participant_insert();
create trigger non_admin_submission before insert on public.survey_submissions
for each row execute function private.guard_participant_insert();
create trigger non_admin_award before insert on public.points_ledger
for each row execute function private.guard_participant_insert();

create function private.lock_membership_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.user_id<>old.user_id then
    raise exception 'Membership identity is immutable' using errcode='23514';
  end if;
  if tg_op='DELETE' then
    perform 1 from public.profiles where id=old.user_id for update;
    return old;
  end if;
  perform 1 from public.profiles where id=new.user_id for update;
  return new;
end;
$$;
create trigger serialize_membership_change before insert or update or delete on private.admin_memberships
for each row execute function private.lock_membership_change();

-- Keep the proven transaction internal; no user can call it around the new guard.
alter function public.submit_survey(uuid,jsonb) set schema private;
alter function private.submit_survey(uuid,jsonb) rename to submit_survey_v2;
create function public.submit_survey(p_assignment_id uuid,p_answers jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform private.lock_participant(auth.uid());
  return private.submit_survey_v2(p_assignment_id,p_answers);
end;
$$;

create or replace function public.available_surveys(p_page integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null or public.is_admin() then raise exception 'Participant access required' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(items) order by assigned_at desc,id),'[]'::jsonb) from (
    select a.id,a.assigned_at,s.title,s.description,s.reward_points,
      (select count(*)::integer from public.survey_questions q where q.survey_id=s.id) as question_count
    from public.survey_assignments a join public.surveys s on s.id=a.survey_id
    where a.user_id=auth.uid() and s.status='published'
      and not exists(select 1 from public.survey_submissions r where r.assignment_id=a.id)
    order by a.assigned_at desc,a.id limit 21 offset (least(greatest(coalesce(p_page,1),1),10000)-1)*20
  ) items);
end;
$$;
create or replace function public.assigned_survey(p_assignment_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null or public.is_admin() then raise exception 'Participant access required' using errcode='42501'; end if;
  return (select jsonb_build_object('id',a.id,'title',s.title,'description',s.description,'reward_points',s.reward_points,
    'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'field_key',q.field_key,
      'section',q.section,'type',q.type,'presentation',q.presentation,'prompt',q.prompt,'required',q.required,
      'config',q.config) order by q.position) from public.survey_questions q where q.survey_id=s.id),'[]'),
    'receipt',case when r.id is null then null else jsonb_build_object('id',r.id,
      'points',r.reward_points_snapshot,'title',r.survey_title_snapshot,'submitted_at',r.submitted_at) end)
    from public.survey_assignments a join public.surveys s on s.id=a.survey_id
      left join public.survey_submissions r on r.assignment_id=a.id
    where a.id=p_assignment_id and a.user_id=auth.uid() and (s.status='published' or r.id is not null));
end;
$$;

-- Retire the old admin-assignment helper without deleting historical records.
drop function private.install_example_survey(uuid);
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.submit_survey(uuid,jsonb) from public,anon;
grant execute on function public.submit_survey(uuid,jsonb) to authenticated;
