-- Clinic Flow core schema v0.1
-- 目标：多租户、最小权限、病人只见自己、Agent 可审计、入口 Token 可防重放。
--
-- 重要：应用服务器必须从已验证的 HttpOnly session 推导 clinic / subject，
-- 并在每个数据库事务开头用 set_config(..., true) 设置下列 LOCAL 上下文；
-- 绝不能直接信任浏览器传入的 clinic_id / subject_id。

begin;

create schema if not exists app_private;

create or replace function app_private.current_clinic_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.clinic_id', true), '')
$$;

create or replace function app_private.current_subject_kind()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.subject_kind', true), '')
$$;

create or replace function app_private.current_subject_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.subject_id', true), '')
$$;

create or replace function app_private.is_staff_or_service()
returns boolean
language sql
stable
as $$
  select coalesce(app_private.current_subject_kind() in ('staff', 'service'), false)
$$;

create or replace function app_private.is_patient()
returns boolean
language sql
stable
as $$
  select coalesce(app_private.current_subject_kind() = 'patient', false)
$$;

create table if not exists clinics (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('dental', 'clinic', 'physio', 'veterinary')),
  district text not null default '',
  phone text not null default '',
  timezone text not null default 'Asia/Hong_Kong',
  business_hours jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinic_services (
  clinic_id text not null references clinics(id) on delete cascade,
  id text not null,
  name text not null,
  duration_min integer not null check (duration_min > 0 and duration_min <= 1440),
  color_token text not null default 'primary',
  active boolean not null default true,
  primary key (clinic_id, id)
);

create table if not exists staff (
  clinic_id text not null references clinics(id) on delete cascade,
  id text not null,
  name text not null,
  role text not null check (role in ('owner','practitioner','nurse','reception','finance','readonly')),
  title text not null default '',
  email text not null default '',
  active boolean not null default true,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (clinic_id, id)
);

create table if not exists patients (
  clinic_id text not null references clinics(id) on delete cascade,
  id text not null,
  file_no text not null,
  name text not null,
  phone text not null,
  preferred_channel text not null check (preferred_channel in ('whatsapp','phone','web')),
  language text not null default 'zh-HK',
  tags jsonb not null default '[]'::jsonb,
  last_visit_at timestamptz,
  next_recall_at timestamptz,
  notes_admin text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, id),
  unique (clinic_id, file_no)
);

create table if not exists appointments (
  clinic_id text not null references clinics(id) on delete cascade,
  id text not null,
  patient_id text not null,
  practitioner_id text not null,
  service_id text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null check (status in ('pending','confirmed','arrived','no_show','cancelled')),
  room text not null default '',
  admin_note text not null default '',
  created_by_type text not null check (created_by_type in ('staff','agent','patient','system')),
  created_by_id text not null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, id),
  foreign key (clinic_id, patient_id) references patients(clinic_id, id) on delete restrict,
  foreign key (clinic_id, practitioner_id) references staff(clinic_id, id) on delete restrict,
  foreign key (clinic_id, service_id) references clinic_services(clinic_id, id) on delete restrict,
  check (end_at > start_at)
);

create index if not exists appointments_clinic_start_idx
  on appointments (clinic_id, start_at);
create index if not exists appointments_practitioner_start_idx
  on appointments (clinic_id, practitioner_id, start_at);
create index if not exists appointments_patient_start_idx
  on appointments (clinic_id, patient_id, start_at desc);

create table if not exists conversations (
  clinic_id text not null references clinics(id) on delete cascade,
  id text not null,
  patient_id text not null,
  channel text not null check (channel in ('whatsapp','phone','web')),
  subject text not null default '',
  state text not null check (state in ('agent_handling','waiting_human','human','closed')),
  unread boolean not null default false,
  assigned_to text,
  last_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (clinic_id, id),
  foreign key (clinic_id, patient_id) references patients(clinic_id, id) on delete restrict,
  foreign key (clinic_id, assigned_to) references staff(clinic_id, id) on delete set null
);

create table if not exists conversation_messages (
  clinic_id text not null,
  id text not null,
  conversation_id text not null,
  patient_id text not null,
  sender_kind text not null check (sender_kind in ('patient','staff','agent','system')),
  author_name text not null default '',
  body text not null,
  sent_at timestamptz not null default now(),
  draft boolean not null default false,
  external_message_id text,
  primary key (clinic_id, id),
  foreign key (clinic_id, conversation_id) references conversations(clinic_id, id) on delete cascade,
  foreign key (clinic_id, patient_id) references patients(clinic_id, id) on delete restrict
);

create index if not exists conversation_messages_thread_idx
  on conversation_messages (clinic_id, conversation_id, sent_at);

create table if not exists urgent_flags (
  clinic_id text not null,
  id text not null,
  patient_id text not null,
  conversation_id text not null,
  source_text text not null,
  matched_keywords jsonb not null default '[]'::jsonb,
  rule text not null,
  created_at timestamptz not null default now(),
  handled_by text,
  handled_at timestamptz,
  primary key (clinic_id, id),
  foreign key (clinic_id, patient_id) references patients(clinic_id, id) on delete restrict,
  foreign key (clinic_id, conversation_id) references conversations(clinic_id, id) on delete cascade,
  foreign key (clinic_id, handled_by) references staff(clinic_id, id) on delete set null
);

create table if not exists agent_tasks (
  clinic_id text not null references clinics(id) on delete cascade,
  id text not null,
  title text not null,
  intent text not null,
  basis jsonb not null default '[]'::jsonb,
  effects jsonb not null default '[]'::jsonb,
  risk text not null check (risk in ('low','medium','high')),
  status text not null check (status in ('auto_running','waiting_approval','failed','done','rejected')),
  created_at timestamptz not null default now(),
  related_patient_id text,
  related_conversation_id text,
  decided_by text,
  decided_at timestamptz,
  failure_reason text not null default '',
  primary key (clinic_id, id),
  foreign key (clinic_id, related_patient_id) references patients(clinic_id, id) on delete set null,
  foreign key (clinic_id, related_conversation_id) references conversations(clinic_id, id) on delete set null,
  foreign key (clinic_id, decided_by) references staff(clinic_id, id) on delete set null
);

create table if not exists agent_plans (
  clinic_id text not null,
  task_id text not null,
  version integer not null check (version > 0),
  schema_id text not null default 'clinic-flow.agent-plan.v1',
  plan jsonb not null,
  plan_sha256 text not null,
  created_at timestamptz not null default now(),
  primary key (clinic_id, task_id, version),
  foreign key (clinic_id, task_id) references agent_tasks(clinic_id, id) on delete cascade
);

create table if not exists agent_execution_receipts (
  clinic_id text not null,
  id text not null,
  task_id text not null,
  plan_version integer not null,
  schema_id text not null default 'clinic-flow.agent-execution-receipt.v1',
  ok boolean not null,
  blocked boolean not null,
  receipt jsonb not null,
  executed_by text,
  executed_at timestamptz not null default now(),
  primary key (clinic_id, id),
  foreign key (clinic_id, task_id, plan_version)
    references agent_plans(clinic_id, task_id, version) on delete restrict,
  foreign key (clinic_id, executed_by) references staff(clinic_id, id) on delete set null
);

create table if not exists reminders (
  clinic_id text not null,
  id text not null,
  patient_id text not null,
  kind text not null check (kind in ('pre_visit','recall_cleaning','recall_vaccine','follow_up','no_reply')),
  template text not null,
  due_at timestamptz not null,
  status text not null check (status in ('scheduled','sent','cancelled','overdue')),
  channel text not null check (channel in ('whatsapp','phone','web')),
  created_at timestamptz not null default now(),
  primary key (clinic_id, id),
  foreign key (clinic_id, patient_id) references patients(clinic_id, id) on delete cascade
);

create index if not exists reminders_due_idx on reminders (clinic_id, status, due_at);

create table if not exists document_cases (
  clinic_id text not null,
  id text not null,
  patient_id text not null,
  kind text not null check (kind in ('insurance','referral','receipt','invoice','certificate','other')),
  title text not null,
  status text not null check (status in ('received','classified','needs_fields','anomaly','ready','sent')),
  missing_fields jsonb not null default '[]'::jsonb,
  anomalies jsonb not null default '[]'::jsonb,
  storage_object_key text,
  source_filename text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, id),
  foreign key (clinic_id, patient_id) references patients(clinic_id, id) on delete restrict
);

create table if not exists staff_invites (
  clinic_id text not null references clinics(id) on delete cascade,
  id text not null,
  role text not null check (role in ('owner','practitioner','nurse','reception','finance','readonly')),
  invitee_name text not null default '',
  code_hash text,
  status text not null check (status in ('pending','used','revoked','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by_staff_id text,
  primary key (clinic_id, id),
  foreign key (clinic_id, redeemed_by_staff_id) references staff(clinic_id, id) on delete set null
);

create table if not exists used_access_tokens (
  clinic_id text not null references clinics(id) on delete cascade,
  jti text not null,
  kind text not null check (kind in ('patient_portal','staff_invite')),
  subject_id text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz not null default now(),
  primary key (clinic_id, jti)
);

create index if not exists used_access_tokens_expiry_idx
  on used_access_tokens (expires_at);

create table if not exists channel_connections (
  clinic_id text not null references clinics(id) on delete cascade,
  id text not null,
  channel text not null check (channel in ('whatsapp','phone','web','email')),
  provider text not null,
  enabled boolean not null default false,
  secret_ref text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, id)
);

create table if not exists outbound_messages (
  clinic_id text not null,
  id text not null,
  patient_id text not null,
  conversation_id text,
  channel text not null check (channel in ('whatsapp','phone','web','email')),
  body text not null,
  status text not null check (status in ('queued','sending','sent','failed','cancelled')),
  idempotency_key text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_message_id text,
  last_error text not null default '',
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (clinic_id, id),
  unique (clinic_id, idempotency_key),
  foreign key (clinic_id, patient_id) references patients(clinic_id, id) on delete restrict,
  foreign key (clinic_id, conversation_id) references conversations(clinic_id, id) on delete set null
);

create table if not exists audit_events (
  clinic_id text not null references clinics(id) on delete cascade,
  id text not null,
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('staff','patient','agent','system')),
  actor_id text not null,
  actor_name text not null default '',
  action text not null,
  target text not null,
  result text not null check (result in ('success','blocked','failed')),
  detail text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  primary key (clinic_id, id)
);

create index if not exists audit_events_time_idx
  on audit_events (clinic_id, occurred_at desc);

-- --------------------------- Row Level Security ---------------------------

alter table clinics enable row level security;
alter table clinic_services enable row level security;
alter table staff enable row level security;
alter table patients enable row level security;
alter table appointments enable row level security;
alter table conversations enable row level security;
alter table conversation_messages enable row level security;
alter table urgent_flags enable row level security;
alter table agent_tasks enable row level security;
alter table agent_plans enable row level security;
alter table agent_execution_receipts enable row level security;
alter table reminders enable row level security;
alter table document_cases enable row level security;
alter table staff_invites enable row level security;
alter table used_access_tokens enable row level security;
alter table channel_connections enable row level security;
alter table outbound_messages enable row level security;
alter table audit_events enable row level security;

-- 诊所基本资料：已认证的本诊所主体可读；只有 staff/service 可写。
create policy clinics_select_tenant on clinics
  for select
  using (id = app_private.current_clinic_id());
create policy clinics_write_staff on clinics
  for all
  using (id = app_private.current_clinic_id() and app_private.is_staff_or_service())
  with check (id = app_private.current_clinic_id() and app_private.is_staff_or_service());

-- 诊所内部资料：病人不可直接读这些表。
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'staff', 'agent_tasks', 'agent_plans', 'agent_execution_receipts',
    'staff_invites', 'used_access_tokens', 'channel_connections', 'outbound_messages', 'audit_events'
  ]
  loop
    execute format(
      'create policy %I on %I for all using (clinic_id = app_private.current_clinic_id() and app_private.is_staff_or_service()) with check (clinic_id = app_private.current_clinic_id() and app_private.is_staff_or_service())',
      tbl || '_staff_tenant', tbl
    );
  end loop;
end $$;

-- 服务目录：本诊所病人可读；写入仍限 staff/service。
create policy services_select_tenant on clinic_services
  for select
  using (clinic_id = app_private.current_clinic_id());
create policy services_write_staff on clinic_services
  for all
  using (clinic_id = app_private.current_clinic_id() and app_private.is_staff_or_service())
  with check (clinic_id = app_private.current_clinic_id() and app_private.is_staff_or_service());

-- 病人：员工/服务可处理全诊所；病人只可看/更新自己。
create policy patients_staff_tenant on patients
  for all
  using (clinic_id = app_private.current_clinic_id() and app_private.is_staff_or_service())
  with check (clinic_id = app_private.current_clinic_id() and app_private.is_staff_or_service());
create policy patients_self_select on patients
  for select
  using (
    clinic_id = app_private.current_clinic_id()
    and app_private.is_patient()
    and id = app_private.current_subject_id()
  );
create policy patients_self_update on patients
  for update
  using (
    clinic_id = app_private.current_clinic_id()
    and app_private.is_patient()
    and id = app_private.current_subject_id()
  )
  with check (
    clinic_id = app_private.current_clinic_id()
    and id = app_private.current_subject_id()
  );

-- 带 patient_id 的业务资料：员工/服务看全租户；病人只看自己。
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'appointments', 'conversations', 'conversation_messages', 'urgent_flags',
    'reminders', 'document_cases'
  ]
  loop
    execute format(
      'create policy %I on %I for all using (clinic_id = app_private.current_clinic_id() and app_private.is_staff_or_service()) with check (clinic_id = app_private.current_clinic_id() and app_private.is_staff_or_service())',
      tbl || '_staff_tenant', tbl
    );
    execute format(
      'create policy %I on %I for select using (clinic_id = app_private.current_clinic_id() and app_private.is_patient() and patient_id = app_private.current_subject_id())',
      tbl || '_patient_self_select', tbl
    );
  end loop;
end $$;

-- 病人可直接做的写操作不开放成任意 SQL UPDATE；
-- 确认到诊、改期、取消、发消息、上传文件一律走服务器函数，
-- 由服务器检查状态机后使用 staff/service 数据库上下文提交并写 audit_events。

-- 强制 RLS 对表拥有者也生效，降低后台误用超权连接的风险。
alter table clinics force row level security;
alter table clinic_services force row level security;
alter table staff force row level security;
alter table patients force row level security;
alter table appointments force row level security;
alter table conversations force row level security;
alter table conversation_messages force row level security;
alter table urgent_flags force row level security;
alter table agent_tasks force row level security;
alter table agent_plans force row level security;
alter table agent_execution_receipts force row level security;
alter table reminders force row level security;
alter table document_cases force row level security;
alter table staff_invites force row level security;
alter table used_access_tokens force row level security;
alter table channel_connections force row level security;
alter table outbound_messages force row level security;
alter table audit_events force row level security;

commit;
