-- Phase 1: schema and permission foundation. All future DDL is a new migration.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table private.admin_memberships (
  user_id uuid primary key references public.profiles(id),
  created_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id)
);

create table public.surveys (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  reward_points integer not null check (reward_points >= 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  definition_version integer not null default 1 check (definition_version > 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz,
  check ((status = 'draft' and published_at is null and archived_at is null)
    or (status = 'published' and published_at is not null and archived_at is null)
    or (status = 'archived' and published_at is not null and archived_at is not null))
);

create table public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id),
  position integer not null check (position >= 0),
  section text not null check (section in ('demographics', 'body')),
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  type text not null check (type in ('single_choice', 'multi_choice', 'text', 'integer')),
  presentation text not null,
  prompt text not null check (char_length(trim(prompt)) between 1 and 2000),
  required boolean not null default true,
  config jsonb not null check (jsonb_typeof(config) = 'object' and config @> '{"version":1}'),
  unique (survey_id, position),
  unique (survey_id, field_key),
  unique (survey_id, id),
  check ((type = 'single_choice' and presentation in ('dropdown', 'radio_cards'))
    or (type = 'multi_choice' and presentation = 'checkbox_cards')
    or (type = 'text' and presentation in ('short_text', 'long_text'))
    or (type = 'integer' and presentation = 'number_input'))
);

create table private.question_checks (
  question_id uuid primary key references public.survey_questions(id),
  rule jsonb not null check (jsonb_typeof(rule) = 'object'),
  rule_version integer not null default 1 check (rule_version = 1)
);

create table public.survey_pushes (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id),
  audience text not null check (audience in ('all', 'selected')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  request_id uuid not null unique,
  request_fingerprint text not null,
  targeted_count integer not null check (targeted_count > 0),
  new_assignment_count integer not null check (new_assignment_count between 0 and targeted_count),
  unique (id, survey_id)
);

create table public.survey_push_targets (
  push_id uuid not null references public.survey_pushes(id),
  user_id uuid not null references public.profiles(id),
  primary key (push_id, user_id)
);

create table public.survey_assignments (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id),
  user_id uuid not null references public.profiles(id),
  first_push_id uuid not null,
  assigned_at timestamptz not null default now(),
  unique (survey_id, user_id),
  unique (id, survey_id, user_id),
  foreign key (first_push_id, survey_id) references public.survey_pushes(id, survey_id),
  foreign key (first_push_id, user_id) references public.survey_push_targets(push_id, user_id)
);

create table public.survey_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique,
  survey_id uuid not null,
  user_id uuid not null,
  submitted_at timestamptz not null default now(),
  survey_title_snapshot text not null,
  reward_points_snapshot integer not null check (reward_points_snapshot >= 0),
  unique (survey_id, user_id),
  unique (id, survey_id),
  unique (id, user_id),
  foreign key (assignment_id, survey_id, user_id)
    references public.survey_assignments(id, survey_id, user_id)
);

create table public.submission_answers (
  submission_id uuid not null,
  survey_id uuid not null,
  question_id uuid not null,
  answer jsonb not null check (jsonb_typeof(answer) = 'object' and octet_length(answer::text) <= 20000),
  primary key (submission_id, question_id),
  foreign key (submission_id, survey_id) references public.survey_submissions(id, survey_id),
  foreign key (survey_id, question_id) references public.survey_questions(survey_id, id)
);

create table private.response_flags (
  submission_id uuid not null,
  question_id uuid not null,
  rule_version integer not null check (rule_version > 0),
  reason_code text not null check (reason_code = 'attention_check_failed'),
  created_at timestamptz not null default now(),
  primary key (submission_id, question_id),
  foreign key (submission_id, question_id) references public.submission_answers(submission_id, question_id)
);

create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  submission_id uuid not null unique,
  amount integer not null check (amount >= 0),
  created_at timestamptz not null default now(),
  foreign key (submission_id, user_id) references public.survey_submissions(id, user_id)
);

create index assignments_user_date on public.survey_assignments(user_id, assigned_at desc);
create index submissions_user_date on public.survey_submissions(user_id, submitted_at desc);
create index ledger_user on public.points_ledger(user_id);
create index push_targets_user on public.survey_push_targets(user_id);
create index pushes_survey on public.survey_pushes(survey_id);
create index questions_survey on public.survey_questions(survey_id);
create index answers_question on public.submission_answers(question_id);

-- Database membership, never mutable auth metadata, is the source of admin identity.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from private.admin_memberships where user_id = auth.uid()
  );
$$;

create function private.assert_admin() returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
end;
$$;

-- The protected admin shell uses the same rejecting guard as future admin RPCs.
create function public.admin_session() returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_admin();
  return true;
end;
$$;

create function public.update_display_name(new_display_name text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  update public.profiles set display_name = nullif(trim(new_display_name), '') where id = auth.uid();
end;
$$;

create function private.provision_profile() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.provision_profile();
-- Include identities created before PollPoint's first deployment.
insert into public.profiles(id) select id from auth.users on conflict (id) do nothing;

-- No browser-accessible bootstrap route. Only service_role can execute this RPC;
-- the local operational script also requires the owner-confirmed target UUID.
create function public.bootstrap_first_admin(target_user_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- Serialize attempts so only one initial admin can ever be provisioned here.
  perform pg_advisory_xact_lock(72130501001);
  if exists (select 1 from private.admin_memberships) then
    raise exception 'Initial admin already configured' using errcode = '23505';
  end if;
  insert into private.admin_memberships(user_id) values (target_user_id);
end;
$$;

-- Explicit grants + RLS: no authenticated caller gets direct mutation privileges.
revoke all on public.profiles, public.surveys, public.survey_questions,
  public.survey_pushes, public.survey_push_targets, public.survey_assignments,
  public.survey_submissions, public.submission_answers, public.points_ledger
  from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles, public.surveys, public.survey_questions,
  public.survey_pushes, public.survey_push_targets, public.survey_assignments,
  public.survey_submissions, public.submission_answers, public.points_ledger to authenticated;

alter table public.profiles enable row level security;
alter table private.admin_memberships enable row level security;
alter table public.surveys enable row level security;
alter table public.survey_questions enable row level security;
alter table private.question_checks enable row level security;
alter table public.survey_pushes enable row level security;
alter table public.survey_push_targets enable row level security;
alter table public.survey_assignments enable row level security;
alter table public.survey_submissions enable row level security;
alter table public.submission_answers enable row level security;
alter table private.response_flags enable row level security;
alter table public.points_ledger enable row level security;

create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy assignments_read on public.survey_assignments for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy submissions_read on public.survey_submissions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy ledger_read on public.points_ledger for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy surveys_read on public.surveys for select to authenticated using (
  (select public.is_admin()) or (
    exists (select 1 from public.survey_assignments a
      where a.survey_id = surveys.id and a.user_id = (select auth.uid()))
    and (status = 'published' or (status = 'archived' and exists (
      select 1 from public.survey_submissions s
      where s.survey_id = surveys.id and s.user_id = (select auth.uid())
    )))
  )
);
create policy questions_read on public.survey_questions for select to authenticated using (
  exists (select 1 from public.surveys s where s.id = survey_questions.survey_id)
);
create policy answers_read on public.submission_answers for select to authenticated using (
  exists (select 1 from public.survey_submissions s where s.id = submission_answers.submission_id)
);
create policy pushes_admin_read on public.survey_pushes for select to authenticated
  using ((select public.is_admin()));
create policy push_targets_admin_read on public.survey_push_targets for select to authenticated
  using ((select public.is_admin()));

revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_session() from public, anon;
revoke all on function public.update_display_name(text) from public, anon;
revoke all on function public.bootstrap_first_admin(uuid) from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function public.is_admin(), public.admin_session(),
  public.update_display_name(text) to authenticated;
grant execute on function public.bootstrap_first_admin(uuid) to service_role;

-- New functions must opt in to API access in each subsequent migration.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;
