-- Smart Scheduling & Privacy Broker Core v0.1
--
-- This migration adds the durable lowering for the generic Service Frontdesk
-- scheduling contract. It intentionally stores worker/customer references and
-- opaque secret references; private phone/address values belong in an encrypted
-- secret store, never in matching, audit, or channel payload tables.
--
-- All state-changing request/hold/booking writes must run in a server
-- transaction with app.clinic_id, app.vertical_id and app.subject_* set from a
-- verified session. The confirm function serializes a worker slot and is the
-- database authority for Hold -> Confirm -> Schedule.

begin;

create extension if not exists btree_gist;

create or replace function app_private.current_vertical_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.vertical_id', true), '')
$$;

create or replace function app_private.is_job_participant()
returns boolean
language sql
stable
as $$
  select coalesce(app_private.current_subject_kind() in ('staff', 'service'), false)
$$;

create table if not exists service_workers (
  clinic_id text not null references clinics(id) on delete cascade,
  vertical_id text not null,
  id text not null,
  display_name text not null,
  timezone text not null default 'Asia/Hong_Kong',
  active boolean not null default true,
  reliability_score numeric(5,4) check (reliability_score is null or (reliability_score >= 0 and reliability_score <= 1)),
  supported_urgencies jsonb not null default '["flexible","normal"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, vertical_id, id)
);

create table if not exists service_worker_areas (
  clinic_id text not null,
  vertical_id text not null,
  worker_id text not null,
  area_id text not null,
  label text not null,
  country_code text,
  postal_codes jsonb not null default '[]'::jsonb,
  center_latitude numeric(9,6),
  center_longitude numeric(9,6),
  max_service_radius_km numeric(8,2),
  primary key (clinic_id, vertical_id, worker_id, area_id),
  foreign key (clinic_id, vertical_id, worker_id)
    references service_workers(clinic_id, vertical_id, id) on delete cascade,
  check (center_latitude is null or center_latitude between -90 and 90),
  check (center_longitude is null or center_longitude between -180 and 180),
  check (max_service_radius_km is null or max_service_radius_km >= 0)
);

create table if not exists service_worker_capabilities (
  clinic_id text not null,
  vertical_id text not null,
  worker_id text not null,
  service_type_id text not null,
  skill_tags jsonb not null default '[]'::jsonb,
  duration_min integer check (duration_min is null or (duration_min > 0 and duration_min <= 1440)),
  primary key (clinic_id, vertical_id, worker_id, service_type_id),
  foreign key (clinic_id, vertical_id, worker_id)
    references service_workers(clinic_id, vertical_id, id) on delete cascade
);

create table if not exists service_worker_availability_rules (
  clinic_id text not null,
  vertical_id text not null,
  worker_id text not null,
  id text not null,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  timezone text not null,
  effective_from date,
  effective_to date,
  primary key (clinic_id, vertical_id, worker_id, id),
  foreign key (clinic_id, vertical_id, worker_id)
    references service_workers(clinic_id, vertical_id, id) on delete cascade,
  check (end_time > start_time),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create table if not exists service_worker_availability_exceptions (
  clinic_id text not null,
  vertical_id text not null,
  worker_id text not null,
  id text not null,
  exception_date date not null,
  kind text not null check (kind in ('unavailable', 'available')),
  start_time time,
  end_time time,
  reason text not null default '',
  primary key (clinic_id, vertical_id, worker_id, id),
  foreign key (clinic_id, vertical_id, worker_id)
    references service_workers(clinic_id, vertical_id, id) on delete cascade,
  check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and end_time > start_time))
);

create table if not exists service_worker_schedule_blocks (
  clinic_id text not null,
  vertical_id text not null,
  worker_id text not null,
  id text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  kind text not null check (kind in ('confirmed_booking','hold','temporary_unavailable','travel_buffer','preparation_buffer','cleanup_buffer')),
  status text not null default 'active' check (status in ('active','released')),
  source_id text,
  primary key (clinic_id, vertical_id, worker_id, id),
  foreign key (clinic_id, vertical_id, worker_id)
    references service_workers(clinic_id, vertical_id, id) on delete cascade,
  check (end_at > start_at)
);

create index if not exists service_worker_blocks_lookup_idx
  on service_worker_schedule_blocks (clinic_id, vertical_id, worker_id, start_at);

create table if not exists service_requests (
  clinic_id text not null references clinics(id) on delete cascade,
  vertical_id text not null,
  id text not null,
  customer_id text not null,
  service_type text not null,
  service_items jsonb not null default '[]'::jsonb,
  approximate_area jsonb,
  requested_date date,
  requested_time time,
  time_window_start timestamptz,
  time_window_end timestamptz,
  estimated_duration_min integer check (estimated_duration_min is null or (estimated_duration_min > 0 and estimated_duration_min <= 1440)),
  urgency text not null default 'normal' check (urgency in ('flexible','normal','urgent','emergency')),
  requirements jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  special_constraints jsonb not null default '[]'::jsonb,
  privacy_level text not null default 'standard' check (privacy_level in ('standard','sensitive','restricted')),
  status text not null default 'DRAFT' check (status in ('DRAFT','MATCHING','OFFERED','HELD','CUSTOMER_CONFIRMED','WORKER_NOTIFIED','SCHEDULED','IN_PROGRESS','COMPLETED','EXPIRED','CANCELLED','DECLINED','RESCHEDULE_REQUIRED','FAILED')),
  selected_candidate_id text,
  current_hold_id text,
  preference jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, vertical_id, id),
  check (time_window_end is null or time_window_start is null or time_window_end > time_window_start)
);

create index if not exists service_requests_status_idx
  on service_requests (clinic_id, vertical_id, status, updated_at desc);

create table if not exists schedule_holds (
  clinic_id text not null,
  vertical_id text not null,
  id text not null,
  request_id text not null,
  worker_id text not null,
  customer_id text not null,
  candidate_id text not null,
  service_start_at timestamptz not null,
  service_end_at timestamptz not null,
  reserved_start_at timestamptz not null,
  reserved_end_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','CONFIRMED','EXPIRED','RELEASED')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, vertical_id, id),
  unique (clinic_id, vertical_id, idempotency_key),
  foreign key (clinic_id, vertical_id, request_id)
    references service_requests(clinic_id, vertical_id, id) on delete restrict,
  foreign key (clinic_id, vertical_id, worker_id)
    references service_workers(clinic_id, vertical_id, id) on delete restrict,
  check (service_end_at > service_start_at),
  check (reserved_end_at > reserved_start_at),
  check (reserved_start_at <= service_start_at and service_end_at <= reserved_end_at),
  exclude using gist (
    clinic_id with =,
    vertical_id with =,
    worker_id with =,
    tstzrange(reserved_start_at, reserved_end_at, '[)') with &&
  ) where (status = 'ACTIVE')
);

create index if not exists schedule_holds_expiry_idx
  on schedule_holds (clinic_id, vertical_id, status, expires_at);

create table if not exists service_schedule_bookings (
  clinic_id text not null,
  vertical_id text not null,
  id text not null,
  worker_id text not null,
  customer_id text not null,
  request_id text not null,
  hold_id text not null,
  service_start_at timestamptz not null,
  service_end_at timestamptz not null,
  reserved_start_at timestamptz not null,
  reserved_end_at timestamptz not null,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED','FAILED')),
  confirmation_idempotency_key text not null,
  failure_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, vertical_id, id),
  unique (clinic_id, vertical_id, confirmation_idempotency_key),
  unique (clinic_id, vertical_id, hold_id),
  foreign key (clinic_id, vertical_id, worker_id)
    references service_workers(clinic_id, vertical_id, id) on delete restrict,
  foreign key (clinic_id, vertical_id, request_id)
    references service_requests(clinic_id, vertical_id, id) on delete restrict,
  foreign key (clinic_id, vertical_id, hold_id)
    references schedule_holds(clinic_id, vertical_id, id) on delete restrict,
  check (service_end_at > service_start_at),
  check (reserved_end_at > reserved_start_at),
  check (reserved_start_at <= service_start_at and service_end_at <= reserved_end_at),
  exclude using gist (
    clinic_id with =,
    vertical_id with =,
    worker_id with =,
    tstzrange(reserved_start_at, reserved_end_at, '[)') with &&
  ) where (status not in ('CANCELLED','FAILED'))
);

create index if not exists service_schedule_bookings_lookup_idx
  on service_schedule_bookings (clinic_id, vertical_id, worker_id, service_start_at);

-- A worker-level transaction lock closes the cross-table race that two
-- separate exclusion constraints cannot close by themselves.
create or replace function app_private.lock_schedule_worker(
  p_clinic_id text,
  p_vertical_id text,
  p_worker_id text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if p_clinic_id is distinct from app_private.current_clinic_id()
     or p_vertical_id is distinct from app_private.current_vertical_id()
     or not app_private.is_job_participant() then
    raise exception 'SCHEDULE_SCOPE_DENIED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', p_clinic_id, p_vertical_id, p_worker_id),
    0
  ));
end;
$$;

create or replace function app_private.confirm_schedule_hold(
  p_clinic_id text,
  p_vertical_id text,
  p_hold_id text,
  p_confirmation_idempotency_key text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_hold schedule_holds%rowtype;
  v_existing service_schedule_bookings%rowtype;
  v_request service_requests%rowtype;
  v_booking_id text;
begin
  if p_clinic_id is distinct from app_private.current_clinic_id()
     or p_vertical_id is distinct from app_private.current_vertical_id()
     or not app_private.is_job_participant() then
    raise exception 'SCHEDULE_SCOPE_DENIED';
  end if;

  if nullif(trim(p_confirmation_idempotency_key), '') is null then
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_KEY_REQUIRED');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', p_clinic_id, p_vertical_id, p_confirmation_idempotency_key),
    1
  ));

  select * into v_hold
  from schedule_holds
  where clinic_id = p_clinic_id and vertical_id = p_vertical_id and id = p_hold_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'HOLD_NOT_FOUND');
  end if;

  select * into v_existing
  from service_schedule_bookings
  where clinic_id = p_clinic_id
    and vertical_id = p_vertical_id
    and confirmation_idempotency_key = p_confirmation_idempotency_key;
  if found then
    if v_existing.status = 'FAILED' then
      return jsonb_build_object(
        'ok', false,
        'duplicate', true,
        'code', 'CONFIRMATION_FAILED',
        'booking_id', v_existing.id
      );
    end if;
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'code', 'DUPLICATE',
      'booking_id', v_existing.id
    );
  end if;

  select * into v_existing
  from service_schedule_bookings
  where clinic_id = p_clinic_id and vertical_id = p_vertical_id and hold_id = p_hold_id;
  if found then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'code', 'DUPLICATE',
      'booking_id', v_existing.id
    );
  end if;

  if v_hold.status <> 'ACTIVE' or v_hold.expires_at <= p_now then
    update schedule_holds
    set status = case when v_hold.status = 'ACTIVE' then 'EXPIRED' else v_hold.status end,
        updated_at = p_now
    where clinic_id = p_clinic_id and vertical_id = p_vertical_id and id = p_hold_id;
    update service_requests
    set status = 'EXPIRED', updated_at = p_now
    where clinic_id = p_clinic_id
      and vertical_id = p_vertical_id
      and id = v_hold.request_id
      and status = 'HELD'
      and current_hold_id = p_hold_id;
    return jsonb_build_object('ok', false, 'code', 'HOLD_EXPIRED');
  end if;

  select * into v_request
  from service_requests
  where clinic_id = p_clinic_id
    and vertical_id = p_vertical_id
    and id = v_hold.request_id
  for update;
  if not found or v_request.status <> 'HELD' or v_request.current_hold_id is distinct from p_hold_id then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE');
  end if;

  perform app_private.lock_schedule_worker(p_clinic_id, p_vertical_id, v_hold.worker_id);

  if exists (
    select 1
    from service_schedule_bookings b
    where b.clinic_id = p_clinic_id
      and b.vertical_id = p_vertical_id
      and b.worker_id = v_hold.worker_id
      and b.status not in ('CANCELLED', 'FAILED')
      and tstzrange(b.reserved_start_at, b.reserved_end_at, '[)') &&
          tstzrange(v_hold.reserved_start_at, v_hold.reserved_end_at, '[)')
  ) then
    return jsonb_build_object('ok', false, 'code', 'BOOKING_CONFLICT');
  end if;

  if exists (
    select 1
    from schedule_holds h
    where h.clinic_id = p_clinic_id
      and h.vertical_id = p_vertical_id
      and h.worker_id = v_hold.worker_id
      and h.id <> v_hold.id
      and h.status = 'ACTIVE'
      and h.expires_at > p_now
      and tstzrange(h.reserved_start_at, h.reserved_end_at, '[)') &&
          tstzrange(v_hold.reserved_start_at, v_hold.reserved_end_at, '[)')
  ) then
    return jsonb_build_object('ok', false, 'code', 'HOLD_CONFLICT');
  end if;

  v_booking_id := 'sbk_' || md5(clock_timestamp()::text || random()::text);
  insert into service_schedule_bookings (
    clinic_id, vertical_id, id, worker_id, customer_id, request_id, hold_id,
    service_start_at, service_end_at, reserved_start_at, reserved_end_at,
    status, confirmation_idempotency_key, created_at, updated_at
  ) values (
    p_clinic_id, p_vertical_id, v_booking_id, v_hold.worker_id, v_hold.customer_id,
    v_hold.request_id, v_hold.id, v_hold.service_start_at, v_hold.service_end_at,
    v_hold.reserved_start_at, v_hold.reserved_end_at, 'SCHEDULED',
    p_confirmation_idempotency_key, p_now, p_now
  );

  update schedule_holds
  set status = 'CONFIRMED', updated_at = p_now
  where clinic_id = p_clinic_id and vertical_id = p_vertical_id and id = p_hold_id;

  update service_requests
  set status = 'CUSTOMER_CONFIRMED', current_hold_id = p_hold_id, updated_at = p_now
  where clinic_id = p_clinic_id and vertical_id = p_vertical_id and id = v_request.id;

  return jsonb_build_object('ok', true, 'duplicate', false, 'code', 'OK', 'booking_id', v_booking_id);
exception
  when exclusion_violation then
    return jsonb_build_object('ok', false, 'code', 'BOOKING_CONFLICT');
end;
$$;

revoke all on function app_private.lock_schedule_worker(text, text, text) from public;
revoke all on function app_private.confirm_schedule_hold(text, text, text, text, timestamptz) from public;

create table if not exists privacy_disclosure_policies (
  clinic_id text not null references clinics(id) on delete cascade,
  vertical_id text not null,
  id text not null,
  policy jsonb not null,
  retention_days jsonb not null default '{"identity":30,"conversation":180,"exact_address":7,"audit":365}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, vertical_id, id)
);

create table if not exists privacy_job_identities (
  clinic_id text not null references clinics(id) on delete cascade,
  vertical_id text not null,
  job_id text not null,
  customer_alias text not null,
  worker_alias text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (clinic_id, vertical_id, job_id)
);

create table if not exists privacy_job_secrets (
  clinic_id text not null,
  vertical_id text not null,
  job_id text not null,
  secret_kind text not null check (secret_kind in ('exact_address','entry_instruction','customer_phone','worker_phone','channel_endpoint')),
  encrypted_payload text not null,
  consent_required boolean not null default true,
  available_after timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (clinic_id, vertical_id, job_id, secret_kind),
  foreign key (clinic_id, vertical_id, job_id)
    references privacy_job_identities(clinic_id, vertical_id, job_id) on delete cascade
);

create table if not exists privacy_audit_events (
  clinic_id text not null references clinics(id) on delete cascade,
  vertical_id text not null,
  id text not null,
  job_id text,
  actor_party text not null check (actor_party in ('customer','worker','platform_agent','human')),
  stage text not null check (stage in ('matching','booking_confirmed','near_service','service_execution','manual','closed')),
  capability text not null,
  decision text not null check (decision in ('allowed','denied')),
  reason_code text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  retention_until timestamptz not null,
  primary key (clinic_id, vertical_id, id),
  foreign key (clinic_id, vertical_id, job_id)
    references privacy_job_identities(clinic_id, vertical_id, job_id) on delete set null
);

create index if not exists privacy_audit_retention_idx
  on privacy_audit_events (retention_until);

create table if not exists job_conversations (
  clinic_id text not null references clinics(id) on delete cascade,
  vertical_id text not null,
  id text not null,
  job_id text not null,
  state text not null default 'agent_handling' check (state in ('agent_handling','waiting_human','human_only','closed')),
  customer_channel text not null check (customer_channel in ('whatsapp','phone','web')),
  worker_channel text not null check (worker_channel in ('whatsapp','phone','web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, vertical_id, id),
  foreign key (clinic_id, vertical_id, job_id)
    references privacy_job_identities(clinic_id, vertical_id, job_id) on delete cascade
);

create table if not exists job_conversation_intents (
  clinic_id text not null,
  vertical_id text not null,
  id text not null,
  conversation_id text not null,
  actor_party text not null check (actor_party in ('customer','worker','human')),
  kind text not null,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  payload jsonb not null default '{}'::jsonb,
  requires_human boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (clinic_id, vertical_id, id),
  foreign key (clinic_id, vertical_id, conversation_id)
    references job_conversations(clinic_id, vertical_id, id) on delete cascade
);

create table if not exists job_channel_messages (
  clinic_id text not null,
  vertical_id text not null,
  id text not null,
  job_id text not null,
  audience text not null check (audience in ('customer','worker')),
  channel text not null check (channel in ('whatsapp','phone','web')),
  endpoint_ref text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','cancelled')),
  idempotency_key text not null,
  provider_message_id text,
  error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (clinic_id, vertical_id, id),
  unique (clinic_id, vertical_id, idempotency_key),
  foreign key (clinic_id, vertical_id, job_id)
    references privacy_job_identities(clinic_id, vertical_id, job_id) on delete cascade,
  check (endpoint_ref !~ '^\+?[0-9 ()-]{7,}$')
);

-- Tenant and vertical safety applies to every new table. Customers may only
-- read their own request/booking rows; holds, secrets and audit remain staff /
-- service controlled. All other mutations are server-side state-machine calls.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'service_workers', 'service_worker_areas', 'service_worker_capabilities',
    'service_worker_availability_rules', 'service_worker_availability_exceptions',
    'service_worker_schedule_blocks', 'service_requests', 'schedule_holds',
    'service_schedule_bookings', 'privacy_disclosure_policies', 'privacy_job_identities',
    'privacy_job_secrets', 'privacy_audit_events', 'job_conversations',
    'job_conversation_intents', 'job_channel_messages'
  ]
  loop
    execute format('alter table %I enable row level security', tbl);
    execute format(
      'create policy %I on %I for all using (clinic_id = app_private.current_clinic_id() and vertical_id = app_private.current_vertical_id() and app_private.is_staff_or_service()) with check (clinic_id = app_private.current_clinic_id() and vertical_id = app_private.current_vertical_id() and app_private.is_staff_or_service())',
      tbl || '_staff_vertical', tbl
    );
  end loop;
end $$;

create policy service_requests_customer_select on service_requests
  for select
  using (
    clinic_id = app_private.current_clinic_id()
    and vertical_id = app_private.current_vertical_id()
    and app_private.is_patient()
    and customer_id = app_private.current_subject_id()
  );

create policy service_bookings_customer_select on service_schedule_bookings
  for select
  using (
    clinic_id = app_private.current_clinic_id()
    and vertical_id = app_private.current_vertical_id()
    and app_private.is_patient()
    and customer_id = app_private.current_subject_id()
  );

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'service_workers', 'service_worker_areas', 'service_worker_capabilities',
    'service_worker_availability_rules', 'service_worker_availability_exceptions',
    'service_worker_schedule_blocks', 'service_requests', 'schedule_holds',
    'service_schedule_bookings', 'privacy_disclosure_policies', 'privacy_job_identities',
    'privacy_job_secrets', 'privacy_audit_events', 'job_conversations',
    'job_conversation_intents', 'job_channel_messages'
  ]
  loop
    execute format('alter table %I force row level security', tbl);
  end loop;
end $$;

commit;
