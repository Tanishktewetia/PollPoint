-- A single statement returns a consistent ledger total and completion page.
create function public.participant_history(p_page integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null or public.is_admin() then
    raise exception 'Participant access required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'total_points', (select coalesce(sum(l.amount),0)::text from public.points_ledger l where l.user_id=auth.uid()),
    'entries', (select coalesce(jsonb_agg(to_jsonb(items) order by submitted_at desc,id),'[]'::jsonb) from (
      select s.id,s.assignment_id,s.survey_title_snapshot as title,
        s.reward_points_snapshot as points,s.submitted_at
      from public.survey_submissions s
      where s.user_id=auth.uid()
      order by s.submitted_at desc,s.id
      limit 21 offset (least(greatest(coalesce(p_page,1),1),10000)-1)*20
    ) items)
  );
end;
$$;
revoke all on function public.participant_history(integer) from public,anon;
grant execute on function public.participant_history(integer) to authenticated;
create index submissions_user_history on public.survey_submissions(user_id,submitted_at desc,id);
