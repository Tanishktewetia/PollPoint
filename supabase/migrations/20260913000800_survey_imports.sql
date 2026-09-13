create table private.survey_imports (
 id uuid primary key default gen_random_uuid(),created_by uuid not null references public.profiles(id),
 request_id uuid not null,content_hash text not null,filename text not null,mime text not null,byte_count integer not null,
 reward_points integer not null check(reward_points>=0),model text not null,prompt_version text not null,
 status text not null check(status in ('processing','ready','failed')),survey_id uuid unique references public.surveys(id),
 error_code text,lease_token uuid not null,lease_expires_at timestamptz not null,attempts integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),last_attempt_at timestamptz not null default now(),
 unique(created_by,request_id),check((status='ready')=(survey_id is not null))
);
alter table private.survey_imports enable row level security;
revoke all on private.survey_imports from public,anon,authenticated;
create index imports_creator_time on private.survey_imports(created_by,last_attempt_at);
create index imports_leases on private.survey_imports(lease_expires_at) where status='processing';
create function public.admin_begin_import(p_request_id uuid,p_meta jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.survey_imports;new_lease uuid:=gen_random_uuid();attempt_count bigint;
begin
 perform private.lock_admin();perform pg_advisory_xact_lock(721308);
 if p_request_id is null or p_meta is null or jsonb_typeof(p_meta)<>'object' or
 (p_meta-array['hash','filename','mime','bytes','reward_points','model','prompt_version'])<>'{}'
 or coalesce(p_meta->>'hash','') !~ '^[a-f0-9]{64}$'
 or coalesce(length(p_meta->>'filename'),0) not between 1 and 160
 or coalesce(p_meta->>'mime','') not in ('text/plain','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
 or coalesce(p_meta->>'bytes','') !~ '^[0-9]{1,7}$' or (p_meta->>'bytes')::integer not between 1 and 4194304
 or coalesce(p_meta->>'reward_points','') !~ '^[0-9]{1,10}$'
 or coalesce(length(p_meta->>'model'),0) not between 1 and 100 or coalesce(length(p_meta->>'prompt_version'),0) not between 1 and 50
 then raise exception 'Invalid import metadata' using errcode='22023';end if;
 select * into r from private.survey_imports where created_by=auth.uid() and request_id=p_request_id for update;
 if found then
  if r.content_hash<>p_meta->>'hash' or r.reward_points<>(p_meta->>'reward_points')::integer or r.model<>p_meta->>'model' or r.prompt_version<>p_meta->>'prompt_version' then
   raise exception 'Use the same file, reward and settings for a retry' using errcode='22023';end if;
  if r.status='ready' then return jsonb_build_object('id',r.id,'status',r.status,'survey_id',r.survey_id);end if;
  if r.status='processing' and r.lease_expires_at>now() then raise exception 'Import is still processing' using errcode='55P03';end if;
 end if;
 select coalesce(sum(attempts),0) into attempt_count from private.survey_imports where created_by=auth.uid() and last_attempt_at>now()-interval '1 hour';
 if attempt_count>=10 then raise exception 'Hourly import limit reached' using errcode='54000';end if;
 if (select count(*) from private.survey_imports where status='processing' and lease_expires_at>now())>=2 then raise exception 'Generation is busy; try again shortly' using errcode='55P03';end if;
 if r.id is null then
  insert into private.survey_imports(created_by,request_id,content_hash,filename,mime,byte_count,reward_points,model,prompt_version,status,lease_token,lease_expires_at)
   values(auth.uid(),p_request_id,p_meta->>'hash',p_meta->>'filename',p_meta->>'mime',(p_meta->>'bytes')::integer,(p_meta->>'reward_points')::integer,
    p_meta->>'model',p_meta->>'prompt_version','processing',new_lease,now()+interval '150 seconds') returning * into r;
 else
  update private.survey_imports set status='processing',error_code=null,lease_token=new_lease,lease_expires_at=now()+interval '150 seconds',
   attempts=attempts+1,last_attempt_at=now(),updated_at=now() where id=r.id returning * into r;
 end if;
 return jsonb_build_object('id',r.id,'status',r.status,'lease_token',r.lease_token);
end; $$;
create function public.admin_finish_import(p_id uuid,p_lease uuid,p_definition jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.survey_imports;target uuid;
begin
 perform private.lock_admin();select * into r from private.survey_imports where id=p_id and created_by=auth.uid() for update;
 if not found then raise exception 'Import not found' using errcode='42501';end if;
 if r.status='ready' then return jsonb_build_object('survey_id',r.survey_id);end if;
 if r.status<>'processing' or r.lease_token is distinct from p_lease or r.lease_expires_at<=now() then raise exception 'Import lease expired; retry with the same file' using errcode='40001';end if;
 -- Only the uploaded form's reward is authoritative.
 target:=private.save_definition(null,null,jsonb_set(p_definition,'{reward_points}',to_jsonb(r.reward_points)),'gemini');
 update private.survey_imports set status='ready',survey_id=target,updated_at=now() where id=p_id;
 return jsonb_build_object('survey_id',target);
end; $$;
create function public.admin_fail_import(p_id uuid,p_lease uuid,p_error text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_admin();
 if p_error not in ('extraction_failed','provider_failed','invalid_draft','interrupted') then raise exception 'Invalid error code' using errcode='22023';end if;
 update private.survey_imports set status='failed',error_code=p_error,updated_at=now()
 where id=p_id and created_by=auth.uid() and lease_token=p_lease and status='processing';
end; $$;
create function public.admin_import_status(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.assert_admin();return(select jsonb_build_object('id',id,'filename',filename,'status',status,'survey_id',survey_id,'error_code',error_code,
 'retryable',status='failed' or (status='processing' and lease_expires_at<=now())) from private.survey_imports where id=p_id and created_by=auth.uid());
end; $$;
revoke all on function public.admin_begin_import(uuid,jsonb),public.admin_finish_import(uuid,uuid,jsonb),public.admin_fail_import(uuid,uuid,text),public.admin_import_status(uuid) from public,anon;
grant execute on function public.admin_begin_import(uuid,jsonb),public.admin_finish_import(uuid,uuid,jsonb),public.admin_fail_import(uuid,uuid,text),public.admin_import_status(uuid) to authenticated;
