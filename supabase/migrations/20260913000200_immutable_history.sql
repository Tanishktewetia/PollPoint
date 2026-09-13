-- Freeze historical data even if a privileged client accidentally attempts edits.
create function private.reject_history_mutation() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'Accepted history is immutable' using errcode = '23514';
end;
$$;

create trigger immutable_submissions before update or delete on public.survey_submissions
for each row execute function private.reject_history_mutation();
create trigger immutable_answers before update or delete on public.submission_answers
for each row execute function private.reject_history_mutation();
create trigger immutable_ledger before update or delete on public.points_ledger
for each row execute function private.reject_history_mutation();
create trigger immutable_assignments before update or delete on public.survey_assignments
for each row execute function private.reject_history_mutation();
create trigger immutable_pushes before update or delete on public.survey_pushes
for each row execute function private.reject_history_mutation();
create trigger immutable_push_targets before update or delete on public.survey_push_targets
for each row execute function private.reject_history_mutation();

create function private.guard_survey_definition() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Archive surveys instead of deleting them' using errcode = '23514';
  end if;
  if new.id is distinct from old.id or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at then
    raise exception 'Survey identity is immutable' using errcode = '23514';
  end if;
  if old.status <> 'draft' then
    if (to_jsonb(new) - array['status','archived_at','updated_at'])
        is distinct from (to_jsonb(old) - array['status','archived_at','updated_at'])
        or (old.status = 'archived' and new.status <> 'archived')
        or new.status = 'draft'
        or (old.archived_at is not null and new.archived_at is distinct from old.archived_at) then
      raise exception 'Published survey definitions are immutable' using errcode = '23514';
    end if;
  elsif new.status = 'archived' then
    raise exception 'Only a published survey can be archived' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger guard_survey_definition before update or delete on public.surveys
for each row execute function private.guard_survey_definition();

create function private.guard_question_definition() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  target_survey uuid;
  survey_status text;
begin
  if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.survey_id is distinct from old.survey_id) then
    raise exception 'Question identity is immutable' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then target_survey := old.survey_id;
  else target_survey := new.survey_id;
  end if;
  select status into survey_status from public.surveys where id = target_survey for update;
  if survey_status is distinct from 'draft' then
    raise exception 'Only draft questions can change' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger guard_question_definition before insert or update or delete on public.survey_questions
for each row execute function private.guard_question_definition();

create function private.guard_question_check() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  target_question uuid;
  survey_status text;
begin
  if tg_op = 'UPDATE' and new.question_id is distinct from old.question_id then
    raise exception 'Check identity is immutable' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then target_question := old.question_id;
  else target_question := new.question_id;
  end if;
  select s.status into survey_status from public.surveys s
    join public.survey_questions q on q.survey_id = s.id
    where q.id = target_question for update of s;
  if survey_status is distinct from 'draft' then
    raise exception 'Only draft check rules can change' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger guard_question_check before insert or update or delete on private.question_checks
for each row execute function private.guard_question_check();

create function private.verify_award_amount() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.survey_submissions s
    where s.id = new.submission_id and s.user_id = new.user_id
      and s.reward_points_snapshot = new.amount) then
    raise exception 'Award must match the accepted submission' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger verify_award_amount before insert on public.points_ledger
for each row execute function private.verify_award_amount();

revoke all on all functions in schema private from public, anon, authenticated;
