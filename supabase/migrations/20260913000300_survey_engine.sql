-- Shared validators are used by publication and submission, not just the UI.
create function private.validate_question_config(q_type text, cfg jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare allowed text[]; opt jsonb; lo integer; hi integer;
begin
  if jsonb_typeof(cfg) is distinct from 'object' or cfg->'version' is distinct from '1'::jsonb then
    raise exception 'Unsupported question configuration' using errcode='22023';
  end if;
  allowed := case q_type
    when 'single_choice' then array['version','options']
    when 'multi_choice' then array['version','options','min','max','exclusive_option_ids']
    when 'text' then array['version','min','max']
    when 'integer' then array['version','min','max','allow_decline'] end;
  if allowed is null or (cfg - allowed) <> '{}'::jsonb then
    raise exception 'Unsupported question fields' using errcode='22023';
  end if;
  if q_type in ('single_choice','multi_choice') then
    if jsonb_typeof(cfg->'options') is distinct from 'array' then
      raise exception 'Options must be an array' using errcode='22023';
    end if;
    if jsonb_array_length(cfg->'options') not between 1 and 250 then
      raise exception 'Invalid option count' using errcode='22023';
    end if;
    for opt in select value from jsonb_array_elements(cfg->'options') loop
      if jsonb_typeof(opt) is distinct from 'object' or (opt-array['id','label']) <> '{}'::jsonb
        or jsonb_typeof(opt->'id') is distinct from 'string'
        or (opt->>'id') !~ '^[A-Za-z0-9_]{1,64}$'
        or jsonb_typeof(opt->'label') is distinct from 'string'
        or char_length(trim(opt->>'label')) not between 1 and 160 then
        raise exception 'Invalid option' using errcode='22023';
      end if;
    end loop;
    if (select count(distinct value->>'id') from jsonb_array_elements(cfg->'options')) <> jsonb_array_length(cfg->'options') then
      raise exception 'Duplicate option IDs' using errcode='22023';
    end if;
  end if;
  if q_type in ('multi_choice','text','integer') then
    if jsonb_typeof(cfg->'min') is distinct from 'number' or jsonb_typeof(cfg->'max') is distinct from 'number'
      or (cfg->>'min') !~ '^-?[0-9]{1,7}$' or (cfg->>'max') !~ '^-?[0-9]{1,7}$' then
      raise exception 'Integer bounds required' using errcode='22023';
    end if;
    lo := (cfg->>'min')::integer; hi := (cfg->>'max')::integer;
    if lo > hi or (q_type='text' and (lo<0 or hi>4000))
      or (q_type='multi_choice' and (lo<0 or hi>jsonb_array_length(cfg->'options') or hi<1))
      or (q_type='integer' and (lo < -1000000 or hi > 1000000)) then
      raise exception 'Invalid bounds' using errcode='22023';
    end if;
  end if;
  if q_type='integer' and cfg ? 'allow_decline' and jsonb_typeof(cfg->'allow_decline') <> 'boolean' then
    raise exception 'Invalid decline setting' using errcode='22023';
  end if;
  if q_type='multi_choice' and cfg ? 'exclusive_option_ids' then
    if jsonb_typeof(cfg->'exclusive_option_ids') is distinct from 'array' then
      raise exception 'Invalid exclusive options' using errcode='22023';
    end if;
    for opt in select value from jsonb_array_elements(cfg->'exclusive_option_ids') loop
      if jsonb_typeof(opt) <> 'string' or not exists (
        select 1 from jsonb_array_elements(cfg->'options') o where o->'id'=opt
      ) then raise exception 'Unknown exclusive option' using errcode='22023'; end if;
    end loop;
    if jsonb_array_length(cfg->'exclusive_option_ids') > 0 and lo > 1 then
      raise exception 'Exclusive options must be valid alone' using errcode='22023';
    end if;
  end if;
end;
$$;

create function private.validate_survey_definition(target_survey uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare q record; check_rule record; demographic_count integer;
begin
  if (select count(*) from public.survey_questions where survey_id=target_survey) not between 5 and 100 then
    raise exception 'Surveys require demographics and at least one body question (maximum 100)' using errcode='22023';
  end if;
  select count(*) into demographic_count from public.survey_questions
    where survey_id=target_survey and section='demographics';
  if demographic_count <> 4 then raise exception 'Exactly four demographic questions are required' using errcode='22023'; end if;
  for q in select * from public.survey_questions where survey_id=target_survey loop
    perform private.validate_question_config(q.type,q.config);
    if q.section='demographics' then
      if q.field_key not in ('age','income_bracket','marital_status','country') or not q.required
        or q.position > (select min(position) from public.survey_questions where survey_id=target_survey and section='body') then
        raise exception 'Demographics must be required and first' using errcode='22023';
      end if;
      if q.field_key='age' then
        if q.type<>'integer' or q.config->'allow_decline' is distinct from 'true'::jsonb
          or (q.config->>'min')::integer<0 or (q.config->>'max')::integer>120 then
          raise exception 'Age must allow decline and use bounds within 0–120' using errcode='22023';
        end if;
      elsif q.type<>'single_choice' or not exists (
        select 1 from jsonb_array_elements(q.config->'options') o where o->>'id'='prefer_not_to_say'
      ) then raise exception 'Demographics require a decline option' using errcode='22023'; end if;
    end if;
  end loop;
  for check_rule in select c.*,sq.type,sq.config from private.question_checks c
    join public.survey_questions sq on sq.id=c.question_id where sq.survey_id=target_survey loop
    if check_rule.type<>'single_choice' or check_rule.rule->'version' is distinct from '1'::jsonb
      or check_rule.rule->>'operator' is distinct from 'equals_option'
      or (check_rule.rule-array['version','operator','expected_option_id']) <> '{}'::jsonb
      or not exists (select 1 from jsonb_array_elements(check_rule.config->'options') o
        where o->'id'=check_rule.rule->'expected_option_id') then
      raise exception 'Invalid attention-check rule' using errcode='22023';
    end if;
  end loop;
end;
$$;

create function private.validate_publication() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    if new.status <> 'draft' then raise exception 'Create a draft before publishing' using errcode='22023'; end if;
  elsif old.status='draft' and new.status='published' then
    perform private.validate_survey_definition(new.id);
  end if;
  return new;
end;
$$;
create trigger validate_publication before insert or update on public.surveys
for each row execute function private.validate_publication();

create function private.trim_answer_text(value text) returns text
language sql immutable set search_path = '' as $$
  select btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;

create function private.validate_answer(q_type text, cfg jsonb, answer jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare selected jsonb;
begin
  perform private.validate_question_config(q_type,cfg);
  if jsonb_typeof(answer) is distinct from 'object' then
    raise exception 'Invalid answer shape' using errcode='22023';
  end if;
  if q_type='single_choice' then
    if (answer-'option_id') <> '{}'::jsonb or jsonb_typeof(answer->'option_id') is distinct from 'string'
      or not exists (select 1 from jsonb_array_elements(cfg->'options') o where o->'id'=answer->'option_id') then
      raise exception 'Choose an available option' using errcode='22023';
    end if;
  elsif q_type='multi_choice' then
    if (answer-'option_ids') <> '{}'::jsonb or jsonb_typeof(answer->'option_ids') is distinct from 'array' then
      raise exception 'Invalid selections' using errcode='22023';
    end if;
    if jsonb_array_length(answer->'option_ids') not between (cfg->>'min')::integer and (cfg->>'max')::integer
      or (select count(distinct value) from jsonb_array_elements(answer->'option_ids')) <> jsonb_array_length(answer->'option_ids') then
      raise exception 'Invalid selection count' using errcode='22023';
    end if;
    for selected in select value from jsonb_array_elements(answer->'option_ids') loop
      if jsonb_typeof(selected)<>'string' or not exists (
        select 1 from jsonb_array_elements(cfg->'options') o where o->'id'=selected
      ) or (coalesce(cfg->'exclusive_option_ids','[]') @> jsonb_build_array(selected)
        and jsonb_array_length(answer->'option_ids')<>1) then
        raise exception 'Invalid option combination' using errcode='22023';
      end if;
    end loop;
  elsif q_type='text' then
    if (answer-'text') <> '{}'::jsonb or jsonb_typeof(answer->'text') is distinct from 'string'
      or char_length(private.trim_answer_text(answer->>'text')) not between (cfg->>'min')::integer and (cfg->>'max')::integer then
      raise exception 'Text does not meet the length requirements' using errcode='22023';
    end if;
  elsif q_type='integer' then
    if answer='{"declined":true}'::jsonb and cfg->'allow_decline'='true'::jsonb then return; end if;
    if (answer-'value') <> '{}'::jsonb or jsonb_typeof(answer->'value') is distinct from 'number'
      or (answer->>'value') !~ '^-?[0-9]{1,7}$' then
      raise exception 'A whole number is required' using errcode='22023';
    end if;
    if (answer->>'value')::integer not between (cfg->>'min')::integer and (cfg->>'max')::integer then
      raise exception 'Number is outside the allowed range' using errcode='22023';
    end if;
  else raise exception 'Unsupported question type' using errcode='22023';
  end if;
end;
$$;

create function public.submit_survey(p_assignment_id uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.survey_assignments; s public.surveys; receipt public.survey_submissions;
  q public.survey_questions; entry jsonb; answer_value jsonb; new_id uuid; submitted timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_answers is null or octet_length(p_answers::text)>65536 then
    raise exception 'Submission is too large' using errcode='22023';
  end if;
  select * into a from public.survey_assignments where id=p_assignment_id and user_id=auth.uid() for update;
  if not found then raise exception 'Survey unavailable' using errcode='42501'; end if;
  select * into receipt from public.survey_submissions where assignment_id=a.id;
  if found then
    return jsonb_build_object('id',receipt.id,'points',receipt.reward_points_snapshot,'submitted_at',receipt.submitted_at);
  end if;
  -- Shared survey lock permits submissions on different assignments concurrently,
  -- and conflicts with the row lock taken by archival/publication updates.
  select * into s from public.surveys where id=a.survey_id for share;
  if s.status<>'published' then raise exception 'Survey unavailable' using errcode='P0002'; end if;
  perform private.validate_survey_definition(s.id);
  if jsonb_typeof(p_answers) is distinct from 'array' then raise exception 'Answers must be an array' using errcode='22023'; end if;
  if jsonb_array_length(p_answers)>100 then raise exception 'Too many answers' using errcode='22023'; end if;
  for entry in select value from jsonb_array_elements(p_answers) loop
    if jsonb_typeof(entry) is distinct from 'object' or (entry-array['question_id','answer']) <> '{}'::jsonb
      or jsonb_typeof(entry->'question_id') is distinct from 'string'
      or not exists (select 1 from public.survey_questions where survey_id=s.id and id::text=entry->>'question_id') then
      raise exception 'Unknown question' using errcode='22023';
    end if;
  end loop;
  if (select count(distinct value->>'question_id') from jsonb_array_elements(p_answers))<>jsonb_array_length(p_answers) then
    raise exception 'Duplicate question answers' using errcode='22023';
  end if;
  for q in select * from public.survey_questions where survey_id=s.id order by position loop
    select value->'answer' into answer_value from jsonb_array_elements(p_answers) where value->>'question_id'=q.id::text;
    if not found then
      if q.required then raise exception 'Required answer missing' using errcode='22023'; end if;
    else
      perform private.validate_answer(q.type,q.config,answer_value);
      if q.required and ((q.type='text' and private.trim_answer_text(answer_value->>'text')='')
        or (q.type='multi_choice' and jsonb_array_length(answer_value->'option_ids')=0)) then
        raise exception 'Required answer missing' using errcode='22023';
      end if;
    end if;
  end loop;
  insert into public.survey_submissions(assignment_id,survey_id,user_id,survey_title_snapshot,reward_points_snapshot)
    values (a.id,s.id,auth.uid(),s.title,s.reward_points) returning id,submitted_at into new_id,submitted;
  insert into public.submission_answers(submission_id,survey_id,question_id,answer)
    select new_id,s.id,(value->>'question_id')::uuid,value->'answer' from jsonb_array_elements(p_answers);
  insert into private.response_flags(submission_id,question_id,rule_version,reason_code)
    select new_id,c.question_id,c.rule_version,'attention_check_failed' from private.question_checks c
      join public.submission_answers r on r.question_id=c.question_id and r.submission_id=new_id
      where r.answer->'option_id' is distinct from c.rule->'expected_option_id';
  insert into public.points_ledger(user_id,submission_id,amount) values (auth.uid(),new_id,s.reward_points);
  return jsonb_build_object('id',new_id,'points',s.reward_points,'submitted_at',submitted);
end;
$$;

-- Invoker reads retain RLS, with explicit ownership even for admin participants.
create function public.available_surveys(p_page integer) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(items) order by assigned_at desc,id), '[]'::jsonb) from (
    select a.id,a.assigned_at,s.title,s.description,s.reward_points,
      (select count(*)::integer from public.survey_questions q where q.survey_id=s.id) as question_count
    from public.survey_assignments a join public.surveys s on s.id=a.survey_id
    where a.user_id=auth.uid() and s.status='published'
      and not exists (select 1 from public.survey_submissions r where r.assignment_id=a.id)
    order by a.assigned_at desc,a.id limit 21 offset (least(greatest(coalesce(p_page,1),1),10000)-1)*20
  ) items;
$$;

create function public.assigned_survey(p_assignment_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',a.id,'title',s.title,'description',s.description,'reward_points',s.reward_points,
    'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'field_key',q.field_key,
      'section',q.section,'type',q.type,'presentation',q.presentation,'prompt',q.prompt,'required',q.required,
      'config',q.config) order by q.position) from public.survey_questions q where q.survey_id=s.id),'[]'),
    'receipt',case when r.id is null then null else jsonb_build_object('id',r.id,
      'points',r.reward_points_snapshot,'title',r.survey_title_snapshot,'submitted_at',r.submitted_at) end)
  from public.survey_assignments a join public.surveys s on s.id=a.survey_id
    left join public.survey_submissions r on r.assignment_id=a.id
  where a.id=p_assignment_id and a.user_id=auth.uid() and (s.status='published' or r.id is not null);
$$;

revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.submit_survey(uuid,jsonb),public.available_surveys(integer),public.assigned_survey(uuid) from public,anon;
grant execute on function public.submit_survey(uuid,jsonb),public.available_surveys(integer),public.assigned_survey(uuid) to authenticated;
