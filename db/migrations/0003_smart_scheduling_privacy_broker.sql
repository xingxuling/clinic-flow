-- Smart Scheduling & Privacy Broker Core v0.1
--
-- This migration adds generic tenant/vertical-scoped tables. It does not rename
-- the existing Clinic Flow compatibility tables. All writes are expected to be
-- performed by a server transaction after deriving clinic/subject context from
-- the verified HttpOnly session.

begin;

-- The exclusion constraint below is the database-side no-double-booking gate.
-- Production deployments must retain this extension rather than replacing the
-- constraint with a check performed only in application code.
create extension if not exists btree_gist;

create or replace function app_private.current_vertical_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.vertical_id', true), '')
$$;

create table if not exists service_workers (
  clinic_id text not null references clinics(id) on delete cascade,
  vertical_id text not null,
  id text not null,
  display_name text not null,
  status text not null check (status in ('active','inactive','on_leave')),
  service_area_ids jsonb not null default '[]'::jsonb,
  capabilities jsonb not null default '[]'::jsonb,
  weekly_availability jsonb not null default '[]'::jsonb,
  availability_exceptions jsonb not null default '[]'::jsonb,
  default_travel_buffer_min integer not null default 0 check (default_travel_buffer_min >= 0),
  preparation_buffer_min integer not null default 0 check (preparation_buffer_min >= 0),
  cleanup_buffer_min integer not null default 0 check (cleanup_buffer_min >= 0),
  max_service_radius_km numeric,
  rating numeric,
  historical_reliability numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, vertical_id, id),
  check (rating is null or rating between 0 and 5),
  check (historical_reliability is null or historical_reliability between 0 and 1)
);

create table if not exists service_requests (
  clinic_id text not null references clinics(id) on delete cascade,
  vertical_id text not null,
  id text not null,
  customer_id text not null,
  subject_id text,
  service_type text not null,
  service_items jsonb not null default '[]'::jsonb,
  approximate_area jsonb not null,
  time_zone text not null default 'UTC',
  requested_date date,
  requested_time time,
  time_window_start timestamptz,
  time_window_end timestamptz,
  estimated_duration_min integer check (estimated_duration_min is null or estimated_duration_min > 0),
  urgency text not null check (urgency in ('flexible','normal','urgent','emergency')),
  requirements jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  special_constraints jsonb not null default '[]'::jsonb,
  privacy_level text not null check (privacy_level in ('standard','sensitive','restricted')),
  customer_preference jsonb,
  status text not null check (status in ('draft','matching','offered','held','customer_confirmed','worker_notified','scheduled','expired','cancelled','declined','reschedule_required','failed')),
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, vertical_id, id),
  foreign key (clinic_id, customer_id) references patients(clinic_id, id) on delete restrict,
  check (time_window_end is null or time_window_start is not null),
  check (time_window_end is null or time_window_end > time_window_start)
);

create unique index if not exists service_requests_idempotency_idx
  on service_requests (clinic_id, vertical_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists service_requests_customer_idx
  on service_requests (clinic_id, vertical_id, customer_id, created_at desc);

create table if not exists service_schedule_reservations (
  clinic_id text not null references clinics(id) on delete cascade,
  vertical_id text not null,
  id text not null,
  kind text not null check (kind in ('hold','booking')),
  worker_id text not null,
  service_request_id text not null,
  booking_id text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  occupancy_start_at timestamptz not null,
  occupancy_end_at timestamptz not null,
  status text not null check (status in ('held','confirmed','expired','released')),
  expires_at timestamptz,
  idempotency_key text,
  created_at timestamptz not null default now(),
  primary key (clinic_id, vertical_id, id),
  foreign key (clinic_id, vertical_id, worker_id) references service_workers(clinic_id, vertical_id, id) on delete restrict,
  foreign key (clinic_id, vertical_id, service_request_id) references service_requests(clinic_id, vertical_id, id) on delete restrict,
  check (end_at > start_at),
  check (occupancy_end_at > occupancy_start_at),
  check (kind <> 'hold' or expires_at is not null)
);

create unique index if not exists service_schedule_reservations_idempotency_idx
  on service_schedule_reservations (clinic_id, vertical_id, idempotency_key)
  where idempotency_key is not null;

alter table service_schedule_reservations
  add constraint service_schedule_reservations_no_overlap
  exclude using gist (
    clinic_id with =,
    vertical_id with =,
    worker_id with =,
    tstzrange(occupancy_start_at, occupancy_end_at, '[)') with &&
  ) where (status in ('held','confirmed'));

create table if not exists service_bookings (
  clinic_id text not null references clinics(id) on delete cascade,
  vertical_id text not null,
  id text not null,
  service_request_id text not null,
  customer_id text not null,
  subject_id text,
  worker_id text not null,
  service_type text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  occupancy_start_at timestamptz not null,
  occupancy_end_at timestamptz not null,
  state text not null check (state in ('DRAFT','MATCHING','OFFERED','HELD','CUSTOMER_CONFIRMED','WORKER_NOTIFIED','SCHEDULED','IN_PROGRESS','COMPLETED','EXPIRED','CANCELLED','DECLINED','RESCHEDULE_REQUIRED','FAILED')),
  reservation_id text not null,
  hold_id text not null,
  job_id text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, vertical_id, id),
  unique (clinic_id, vertical_id, idempotency_key),
  unique (clinic_id, vertical_id, reservation_id),
  foreign key (clinic_id, vertical_id, service_request_id) references service_requests(clinic_id, vertical_id, id) on delete restrict,
  foreign key (clinic_id, customer_id) references patients(clinic_id, id) on delete restrict,
  foreign key (clinic_id, vertical_id, worker_id) references service_workers(clinic_id, vertical_id, id) on delete restrict,
  foreign key (clinic_id, vertical_id, reservation_id) references service_schedule_reservations(clinic_id, vertical_id, id) on delete restrict,
  check (end_at > start_at),
  check (occupancy_end_at > occupancy_start_at)
);

create index if not exists service_bookings_worker_start_idx
  on service_bookings (clinic_id, vertical_id, worker_id, start_at);
create index if not exists service_bookings_customer_start_idx
  on service_bookings (clinic_id, vertical_id, customer_id, start_at desc);

create table if not exists service_privacy_contexts (
  clinic_id text not null references clinics(id) on delete cascade,
  vertical_id text not null,
  id text not null,
  job_id text not null,
  customer_id text not null,
  worker_id text not null,
  customer_public_id text not null,
  worker_public_id text not null,
  customer_display_name text not null,
  worker_display_name text not null,
  service_type text not null,
  approximate_area_label text not null,
  private_vault_ref text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_min integer not null check (duration_min > 0),
  requirements jsonb not null default '[]'::jsonb,
  stage text not null check (stage in ('matching','confirmed','near_service','completed')),
  policy jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (clinic_id, vertical_id, id),
  foreign key (clinic_id, customer_id) references patients(clinic_id, id) on delete restrict,
  foreign key (clinic_id, vertical_id, worker_id) references service_workers(clinic_id, vertical_id, id) on delete restrict
);

create table if not exists service_privacy_consents (
  clinic_id text not null references clinics(id) on delete cascade,
  vertical_id text not null,
  id text not null,
  context_id text not null,
  job_id text not null,
  customer_id text not null,
  capability text not null check (capability = 'job.exact_address'),
  purpose text not null,
  granted_at timestamptz not null default now(),
  primary key (clinic_id, vertical_id, id),
  unique (clinic_id, vertical_id, context_id, capability, purpose),
  foreign key (clinic_id, vertical_id, context_id) references service_privacy_contexts(clinic_id, vertical_id, id) on delete cascade,
  foreign key (clinic_id, customer_id) references patients(clinic_id, id) on delete restrict
);

create table if not exists service_jobs (
  clinic_id text not null references clinics(id) on delete cascade,
  vertical_id text not null,
  id text not null,
  booking_id text not null,
  customer_id text not null,
  worker_id text not null,
  customer_public_id text not null,
  worker_public_id text not null,
  customer_display_name text not null,
  worker_display_name text not null,
  privacy_context_id text not null,
  conversation_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (clinic_id, vertical_id, id),
  foreign key (clinic_id, vertical_id, booking_id) references service_bookings(clinic_id, vertical_id, id) on delete restrict,
  foreign key (clinic_id, customer_id) references patients(clinic_id, id) on delete restrict,
  foreign key (clinic_id, vertical_id, worker_id) references service_workers(clinic_id, vertical_id, id) on delete restrict,
  foreign key (clinic_id, vertical_id, privacy_context_id) references service_privacy_contexts(clinic_id, vertical_id, id) on delete restrict,
  unique (clinic_id, vertical_id, booking_id),
  unique (clinic_id, vertical_id, privacy_context_id)
);

create table if not exists service_job_conversations (
  clinic_id text not null references clinics(id) on delete cascade,
  vertical_id text not null,
  id text not null,
  job_id text not null,
  customer_agent_id text not null,
  worker_agent_id text not null,
  state text not null check (state in ('agent_handling','waiting_human','human_only','closed')),
  customer_paused boolean not null default false,
  worker_paused boolean not null default false,
  human_takeover boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, vertical_id, id),
  foreign key (clinic_id, vertical_id, job_id) references service_jobs(clinic_id, vertical_id, id) on delete cascade deferrable initially deferred,
  unique (clinic_id, vertical_id, job_id)
);

alter table service_jobs
  add constraint service_jobs_conversation_fk
  foreign key (clinic_id, vertical_id, conversation_id)
  references service_job_conversations(clinic_id, vertical_id, id) on delete restrict
  deferrable initially deferred;

create table if not exists service_privacy_audit_events (
  clinic_id text not null references clinics(id) on delete cascade,
  vertical_id text not null,
  id text not null,
  context_id text not null,
  job_id text not null,
  requested_by text not null check (requested_by in ('customer','worker','staff','customer_agent','worker_agent')),
  capability text not null,
  purpose text not null,
  decision text not null check (decision in ('allowed','blocked')),
  disclosed_fields jsonb not null default '[]'::jsonb,
  consented boolean not null default false,
  occurred_at timestamptz not null default now(),
  primary key (clinic_id, vertical_id, id),
  foreign key (clinic_id, vertical_id, context_id) references service_privacy_contexts(clinic_id, vertical_id, id) on delete cascade
);

create table if not exists service_notification_intents (
  clinic_id text not null references clinics(id) on delete cascade,
  vertical_id text not null,
  id text not null,
  job_id text not null,
  audience text not null check (audience in ('customer','worker')),
  channel text not null check (channel in ('web','whatsapp','sms','email')),
  purpose text not null check (purpose in ('utility','marketing')),
  body text not null,
  status text not null check (status in ('queued','sent','failed')),
  policy_required boolean not null,
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (clinic_id, vertical_id, id),
  foreign key (clinic_id, vertical_id, job_id) references service_jobs(clinic_id, vertical_id, id) on delete cascade
);

create index if not exists service_notification_intents_job_idx
  on service_notification_intents (clinic_id, vertical_id, job_id, status);

-- --------------------------- Row Level Security ---------------------------

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'service_workers', 'service_schedule_reservations', 'service_privacy_contexts',
    'service_privacy_consents', 'service_jobs', 'service_job_conversations', 'service_privacy_audit_events',
    'service_notification_intents'
  ]
  loop
    execute format('alter table %I enable row level security', tbl);
    execute format('alter table %I force row level security', tbl);
    execute format(
      'create policy %I on %I for all using (clinic_id = app_private.current_clinic_id() and vertical_id = app_private.current_vertical_id() and app_private.is_staff_or_service()) with check (clinic_id = app_private.current_clinic_id() and vertical_id = app_private.current_vertical_id() and app_private.is_staff_or_service())',
      tbl || '_staff_tenant', tbl
    );
  end loop;
end $$;

alter table service_requests enable row level security;
alter table service_requests force row level security;
create policy service_requests_staff_tenant on service_requests
  for all
  using (clinic_id = app_private.current_clinic_id() and vertical_id = app_private.current_vertical_id() and app_private.is_staff_or_service())
  with check (clinic_id = app_private.current_clinic_id() and vertical_id = app_private.current_vertical_id() and app_private.is_staff_or_service());
create policy service_requests_patient_self_select on service_requests
  for select
  using (
    clinic_id = app_private.current_clinic_id()
    and vertical_id = app_private.current_vertical_id()
    and app_private.is_patient()
    and customer_id = app_private.current_subject_id()
  );

alter table service_bookings enable row level security;
alter table service_bookings force row level security;
create policy service_bookings_staff_tenant on service_bookings
  for all
  using (clinic_id = app_private.current_clinic_id() and vertical_id = app_private.current_vertical_id() and app_private.is_staff_or_service())
  with check (clinic_id = app_private.current_clinic_id() and vertical_id = app_private.current_vertical_id() and app_private.is_staff_or_service());
create policy service_bookings_patient_self_select on service_bookings
  for select
  using (
    clinic_id = app_private.current_clinic_id()
    and vertical_id = app_private.current_vertical_id()
    and app_private.is_patient()
    and customer_id = app_private.current_subject_id()
  );

-- Patients do not receive direct SQL access to privacy contexts, reservations,
-- job internals, private-vault refs or notification rows. A server projection
-- may return only the fields allowed by the Privacy Broker policy.

commit;
