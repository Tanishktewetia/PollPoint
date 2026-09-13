-- Shared manual/import authoring, exact-version approval and participant targeting.
alter table public.surveys drop constraint surveys_status_check;
alter table public.surveys drop constraint surveys_check;
alter table public.surveys add constraint surveys_status_check check(status in ('draft','needs_review','published','archived'));
alter table public.surveys add constraint surveys_lifecycle check(
 (status in ('draft','needs_review') and published_at is null and archived_at is null)
 or (status='published' and published_at is not null and archived_at is null)
 or (status='archived' and published_at is not null and archived_at is not null));
alter table public.surveys add column authoring_source text not null default 'manual' check(authoring_source in ('manual','gemini')),
 add column approved_by uuid references public.profiles(id), add column approved_at timestamptz,
 add column approved_definition_version integer;
alter table public.surveys add constraint survey_approval_consistent check(
 (approved_by is null and approved_at is null and approved_definition_version is null)
 or (approved_by is not null and approved_at is not null and approved_definition_version=definition_version));

create function private.lock_admin() returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles where id=auth.uid() for update;
 perform private.assert_admin();
end; $$;
create or replace function private.guard_survey_definition() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Archive surveys instead of deleting them' using errcode='23514'; end if;
 if new.id<>old.id or new.created_by<>old.created_by or new.created_at<>old.created_at or new.authoring_source<>old.authoring_source then
  raise exception 'Survey identity is immutable' using errcode='23514'; end if;
 if old.status in ('published','archived') then
  if (to_jsonb(new)-array['status','archived_at','updated_at']) is distinct from (to_jsonb(old)-array['status','archived_at','updated_at'])
    or new.status not in ('published','archived') or (old.status='archived' and new.status<>'archived')
    or (old.archived_at is not null and new.archived_at is distinct from old.archived_at) then
   raise exception 'Published survey definitions are immutable' using errcode='23514'; end if;
 else
  if new.status='archived' then raise exception 'Only published surveys can be archived' using errcode='23514'; end if;
  if (new.title,new.description,new.reward_points) is distinct from (old.title,old.description,old.reward_points) then
   new.definition_version:=old.definition_version+1;
  end if;
  if new.definition_version<>old.definition_version then
   new.approved_by:=null;new.approved_at:=null;new.approved_definition_version:=null;
  end if;
 end if;
 new.updated_at:=now();return new;
end; $$;
create or replace function private.guard_question_definition() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid; state text;
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.survey_id<>old.survey_id) then raise exception 'Question identity is immutable' using errcode='23514'; end if;
 if tg_op='DELETE' then target:=old.survey_id;else target:=new.survey_id;end if;
 select status into state from public.surveys where id=target for update;
 if state not in ('draft','needs_review') then raise exception 'Only draft questions can change' using errcode='23514';end if;
 update public.surveys set definition_version=definition_version+1 where id=target;
 if tg_op='DELETE' then return old;end if;return new;
end; $$;
create or replace function private.guard_question_check() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid; parent uuid;state text;
begin
 if tg_op='UPDATE' and new.question_id<>old.question_id then raise exception 'Check identity is immutable' using errcode='23514';end if;
 if tg_op='DELETE' then target:=old.question_id;else target:=new.question_id;end if;
 select s.id,s.status into parent,state from public.surveys s join public.survey_questions q on q.survey_id=s.id where q.id=target for update of s;
 if state not in ('draft','needs_review') then raise exception 'Only draft checks can change' using errcode='23514';end if;
 update public.surveys set definition_version=definition_version+1 where id=parent;
 if tg_op='DELETE' then return old;end if;return new;
end; $$;
create or replace function private.validate_publication() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.status not in ('draft','needs_review') then raise exception 'Create a draft first' using errcode='22023';end if;
 elsif new.status='published' and old.status<>'published' then
  perform private.validate_survey_definition(new.id);
  if old.status<>'draft' or old.approved_definition_version is distinct from old.definition_version
    or new.approved_definition_version is distinct from new.definition_version or old.approved_by is null then
   raise exception 'Approve the current definition before pushing' using errcode='22023';end if;
 end if;return new;
end; $$;

create function public.admin_user_roster(p_page integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.assert_admin();
 return (select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc,id),'[]') from (
  select p.id,p.display_name,u.email,p.created_at,
   (select coalesce(sum(l.amount),0)::text from public.points_ledger l where l.user_id=p.id) total_points
  from public.profiles p join auth.users u on u.id=p.id
  where not exists(select 1 from private.admin_memberships m where m.user_id=p.id)
  order by p.created_at desc,p.id limit 21 offset (least(greatest(coalesce(p_page,1),1),10000)-1)*20
 )r);
end; $$;
create function public.admin_survey_list(p_page integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.assert_admin();
 return (select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc,id),'[]') from (
  select id,title,status,reward_points,definition_version,approved_definition_version,authoring_source,created_at from public.surveys
  order by created_at desc,id limit 21 offset (least(greatest(coalesce(p_page,1),1),10000)-1)*20
 )r);
end; $$;
create function public.admin_survey(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.assert_admin();
 return (select to_jsonb(s)||jsonb_build_object('questions',coalesce((select jsonb_agg(
  (to_jsonb(q)-array['survey_id','position'])||case when c.question_id is null then '{}'::jsonb else jsonb_build_object('check',c.rule) end
  order by q.position) from public.survey_questions q left join private.question_checks c on c.question_id=q.id where q.survey_id=s.id),'[]'))
 from public.surveys s where s.id=p_id);
end; $$;

-- Internal persistence helper shared by manual saves and completed imports.
create function private.save_definition(p_id uuid,p_version integer,p_definition jsonb,p_source text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid; s public.surveys; item jsonb;qid uuid;pos integer:=0;
begin
 if p_definition is null or octet_length(p_definition::text)>524288 or jsonb_typeof(p_definition)<>'object'
 or (p_definition-array['title','description','reward_points','questions'])<>'{}' or jsonb_typeof(p_definition->'questions')<>'array'
 or jsonb_array_length(p_definition->'questions') not between 5 and 100
 or jsonb_typeof(p_definition->'title')<>'string' or jsonb_typeof(p_definition->'description')<>'string'
 or coalesce(p_definition->>'reward_points','')!~ '^[0-9]{1,10}$' then raise exception 'Invalid survey definition' using errcode='22023';end if;
 if p_id is null then
  insert into public.surveys(title,description,reward_points,created_by,status,authoring_source)
  values(p_definition->>'title',p_definition->>'description',(p_definition->>'reward_points')::integer,auth.uid(),case when p_source='gemini' then 'needs_review' else 'draft' end,p_source) returning id into target;
 else
  select * into s from public.surveys where id=p_id for update;
  if not found then raise exception 'Survey not found' using errcode='P0002';end if;
  if s.status not in ('draft','needs_review') or s.definition_version is distinct from p_version then raise exception 'Survey changed; reload before saving' using errcode='40001';end if;
  target:=s.id;
  delete from private.question_checks where question_id in(select id from public.survey_questions where survey_id=target);
  delete from public.survey_questions where survey_id=target;
  update public.surveys set title=p_definition->>'title',description=p_definition->>'description',reward_points=(p_definition->>'reward_points')::integer,
   definition_version=definition_version+1 where id=target;
 end if;
 for item in select value from jsonb_array_elements(p_definition->'questions') loop
  if jsonb_typeof(item)<>'object' or (item-array['field_key','section','type','presentation','prompt','required','config','check'])<>'{}'
    or jsonb_typeof(item->'required') is distinct from 'boolean' then raise exception 'Invalid question' using errcode='22023';end if;
  insert into public.survey_questions(survey_id,position,section,field_key,type,presentation,prompt,required,config)
  values(target,pos,item->>'section',item->>'field_key',item->>'type',item->>'presentation',item->>'prompt',(item->>'required')::boolean,item->'config') returning id into qid;
  if item ? 'check' then insert into private.question_checks(question_id,rule) values(qid,item->'check');end if;
  pos:=pos+1;
 end loop;
 perform private.validate_survey_definition(target);return target;
end; $$;
create function public.admin_save_survey(p_id uuid,p_version integer,p_definition jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin perform private.lock_admin();target:=private.save_definition(p_id,p_version,p_definition,'manual');return public.admin_survey(target);end; $$;
create function public.admin_approve_survey(p_id uuid,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.surveys;
begin
 perform private.lock_admin();select * into s from public.surveys where id=p_id for update;
 if not found or s.status not in ('draft','needs_review') or s.definition_version is distinct from p_version then raise exception 'Survey changed; reload before approving' using errcode='40001';end if;
 perform private.validate_survey_definition(p_id);
 update public.surveys set status='draft',approved_by=auth.uid(),approved_at=now(),approved_definition_version=definition_version where id=p_id;
 return public.admin_survey(p_id);
end; $$;
create function public.admin_archive_survey(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform private.lock_admin();update public.surveys set status='archived',archived_at=now() where id=p_id and status='published';if not found then raise exception 'Published survey required' using errcode='22023';end if;end; $$;
create function public.admin_copy_survey(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb;target uuid;
begin
 perform private.lock_admin();d:=public.admin_survey(p_id);
 if d is null then raise exception 'Survey not found' using errcode='P0002';end if;
 d:=jsonb_build_object('title',left('Copy of '||(d->>'title'),160),'description',d->'description','reward_points',d->'reward_points',
 'questions',(select jsonb_agg(value-'id') from jsonb_array_elements(d->'questions')));
 target:=private.save_definition(null,null,d,'manual');return public.admin_survey(target);
end; $$;

create function public.admin_push_survey(p_id uuid,p_version integer,p_audience text,p_users uuid[],p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.surveys; existing public.survey_pushes;targets uuid[];fingerprint text;pid uuid;new_count integer;
begin
 perform private.lock_admin();
 if p_request_id is null or p_audience not in ('all','selected') or p_audience is null or coalesce(array_length(p_users,1),0)>10000 then raise exception 'Invalid audience' using errcode='22023';end if;
 if p_audience='all' and coalesce(array_length(p_users,1),0)>0 then raise exception 'All audience takes no selected IDs' using errcode='22023';end if;
 select coalesce(array_agg(distinct u order by u),'{}') into targets from unnest(p_users) u;
 fingerprint:=jsonb_build_object('actor',auth.uid(),'survey',p_id,'version',p_version,'audience',p_audience,'users',targets)::text;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,721307));
 select * into existing from public.survey_pushes where request_id=p_request_id;
 if found then
  if existing.request_fingerprint<>fingerprint then raise exception 'Request ID already used' using errcode='22023';end if;
  return jsonb_build_object('id',existing.id,'targeted',existing.targeted_count,'assigned',existing.new_assignment_count,'already_assigned',existing.targeted_count-existing.new_assignment_count);
 end if;
 if p_audience='all' then select coalesce(array_agg(p.id order by p.id),'{}') into targets from public.profiles p where not exists(select 1 from private.admin_memberships m where m.user_id=p.id);end if;
 if cardinality(targets)=0 then raise exception 'Choose at least one participant' using errcode='22023';end if;
 if p_audience='selected' and exists(select 1 from private.admin_memberships where user_id=any(targets)) then raise exception 'Admins cannot be targeted' using errcode='22023';end if;
 -- Lock recipients before the survey, matching submission lock order.
 perform id from public.profiles where id=any(targets) order by id for update;
 if p_audience='all' then select coalesce(array_agg(u order by u),'{}') into targets from unnest(targets) u where not exists(select 1 from private.admin_memberships where user_id=u);
 elsif exists(select 1 from unnest(targets) u where u is null or not exists(select 1 from public.profiles where id=u) or exists(select 1 from private.admin_memberships where user_id=u)) then
  raise exception 'Selected recipients must be non-admin users' using errcode='22023';end if;
 if cardinality(targets)=0 then raise exception 'No eligible participants' using errcode='22023';end if;
 select * into s from public.surveys where id=p_id for update;
 if not found or s.status not in ('draft','published') or s.definition_version is distinct from p_version then raise exception 'Survey unavailable or changed' using errcode='40001';end if;
 if s.status='draft' then
  if s.approved_definition_version is distinct from s.definition_version then raise exception 'Approve before pushing' using errcode='22023';end if;
  update public.surveys set status='published',published_at=now() where id=p_id;
 end if;
 select count(*) into new_count from unnest(targets) u where not exists(select 1 from public.survey_assignments where survey_id=p_id and user_id=u);
 insert into public.survey_pushes(survey_id,audience,created_by,request_id,request_fingerprint,targeted_count,new_assignment_count)
 values(p_id,p_audience,auth.uid(),p_request_id,fingerprint,cardinality(targets),new_count) returning id into pid;
 insert into public.survey_push_targets select pid,unnest(targets);
 insert into public.survey_assignments(survey_id,user_id,first_push_id) select p_id,unnest(targets),pid on conflict(survey_id,user_id) do nothing;
 return jsonb_build_object('id',pid,'targeted',cardinality(targets),'assigned',new_count,'already_assigned',cardinality(targets)-new_count);
end; $$;
create function public.admin_responses(p_id uuid,p_page integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.assert_admin();
 return (select coalesce(jsonb_agg(to_jsonb(r) order by submitted_at desc,id),'[]') from (
  select s.id,s.user_id,p.display_name,u.email,s.submitted_at,s.reward_points_snapshot as points,
   (select coalesce(jsonb_agg(jsonb_build_object('prompt',q.prompt,'question',to_jsonb(q)-array['survey_id','position'],'answer',a.answer) order by q.position),'[]') from public.submission_answers a join public.survey_questions q on q.id=a.question_id where a.submission_id=s.id) answers,
   (select coalesce(jsonb_agg(jsonb_build_object('question_id',f.question_id,'reason',f.reason_code)),'[]') from private.response_flags f where f.submission_id=s.id) flags
  from public.survey_submissions s join public.profiles p on p.id=s.user_id join auth.users u on u.id=s.user_id
  where s.survey_id=p_id order by s.submitted_at desc,s.id limit 21 offset (least(greatest(coalesce(p_page,1),1),10000)-1)*20
 )r);
end; $$;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.admin_user_roster(integer),public.admin_survey_list(integer),public.admin_survey(uuid),public.admin_save_survey(uuid,integer,jsonb),public.admin_approve_survey(uuid,integer),public.admin_archive_survey(uuid),public.admin_copy_survey(uuid),public.admin_push_survey(uuid,integer,text,uuid[],uuid),public.admin_responses(uuid,integer) from public,anon;
grant execute on function public.admin_user_roster(integer),public.admin_survey_list(integer),public.admin_survey(uuid),public.admin_save_survey(uuid,integer,jsonb),public.admin_approve_survey(uuid,integer),public.admin_archive_survey(uuid),public.admin_copy_survey(uuid),public.admin_push_survey(uuid,integer,text,uuid[],uuid),public.admin_responses(uuid,integer) to authenticated;
