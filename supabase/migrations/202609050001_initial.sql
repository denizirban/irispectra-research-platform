-- Irispectra Research Platform — initial private research-data schema.
-- All participant-facing access is mediated by server-side routes using the
-- Supabase service role. No anonymous table or object policies are created.

create extension if not exists pgcrypto;

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_name text not null,
  last_name text not null,
  participant_email text not null,
  age_years integer not null check (age_years between 18 and 120),
  country_region text,
  status text not null default 'uploading',
  idempotency_key text not null unique,
  retention_policy text not null,
  terms_version text not null,
  privacy_version text not null,
  consent_form_version text not null
);

create table if not exists public.image_objects (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  modality text not null,
  laterality text not null check (laterality in ('left', 'right')),
  storage_path text not null unique,
  content_type text not null,
  byte_size bigint not null check (byte_size > 0),
  checksum_sha256 text not null,
  width_px integer not null check (width_px > 0),
  height_px integer not null check (height_px > 0),
  quality_metrics jsonb not null default '{}'::jsonb,
  unique (submission_id, modality, laterality)
);

create table if not exists public.consent_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  consent_type text not null,
  granted boolean not null,
  policy_version text not null
);

create table if not exists public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null,
  model_family text not null,
  model_version text not null,
  pipeline_version text not null,
  diagnostics jsonb not null default '{}'::jsonb
);

create table if not exists public.derived_features (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references public.analysis_runs(id) on delete cascade,
  image_object_id uuid references public.image_objects(id) on delete cascade,
  created_at timestamptz not null default now(),
  feature_family text not null,
  feature_name text not null,
  value_numeric double precision,
  value_json jsonb,
  units text,
  uncertainty_json jsonb,
  method_version text not null
);

create table if not exists public.pupillometry_sessions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.submissions(id) on delete set null,
  created_at timestamptz not null default now(),
  protocol_version text not null,
  calibration_status text not null,
  device_metadata jsonb not null default '{}'::jsonb,
  summary_metrics jsonb not null default '{}'::jsonb
);

create table if not exists public.pupil_samples (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.pupillometry_sessions(id) on delete cascade,
  elapsed_ms integer not null check (elapsed_ms >= 0),
  pupil_proxy_px double precision,
  confidence double precision,
  stimulus_state text,
  sample_metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  completed_at timestamptz,
  request_token_hash text not null unique,
  status text not null default 'requested'
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  submission_id uuid references public.submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  actor_type text not null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists image_objects_submission_idx on public.image_objects(submission_id);
create index if not exists consent_events_submission_idx on public.consent_events(submission_id);
create index if not exists analysis_runs_submission_idx on public.analysis_runs(submission_id);
create index if not exists deletion_requests_submission_idx on public.deletion_requests(submission_id);
create index if not exists audit_events_submission_idx on public.audit_events(submission_id);

alter table public.submissions enable row level security;
alter table public.image_objects enable row level security;
alter table public.consent_events enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.derived_features enable row level security;
alter table public.pupillometry_sessions enable row level security;
alter table public.pupil_samples enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.audit_events enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'iris-submissions',
  'iris-submissions',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

