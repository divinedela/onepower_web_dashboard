begin;

-- Enum for push triggers (idempotent)
do $$
begin
  create type public.push_trigger as enum (
    'donation_success',
    'donation_failed',
    'campaign_approved',
    'campaign_rejected',
    'campaign_starting_soon',
    'campaign_ending_soon',
    'campaign_ended',
    'target_reached',
    'news_published',
    'password_changed',
    'device_new_login',
    'maintenance',
    'custom_manual'
  );
exception
  when duplicate_object then null;
end$$;

-- Main rules table
create table if not exists public.push_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  trigger public.push_trigger not null,
  audience jsonb not null default '{}'::jsonb,
  constraints jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  min_app_version text,
  priority int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Published snapshots
create table if not exists public.push_rule_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null,
  rules_json jsonb not null,
  checksum text,
  comment text,
  published_at timestamptz not null default now(),
  created_by uuid,
  unique(version)
);

-- Latest published view exposed to clients
create or replace view public.public_push_config as
with latest as (
  select version, published_at, rules_json
  from public.push_rule_versions
  where published_at is not null
  order by version desc
  limit 1
)
select * from latest;

-- RLS
alter table if exists public.push_rules enable row level security;
alter table if exists public.push_rule_versions enable row level security;

-- Policies
-- service role full access
drop policy if exists push_rules_service_all on public.push_rules;
create policy push_rules_service_all on public.push_rules
  for all to service_role
  using (true) with check (true);

drop policy if exists push_rule_versions_service_all on public.push_rule_versions;
create policy push_rule_versions_service_all on public.push_rule_versions
  for all to service_role
  using (true) with check (true);

-- allow read-only access to published configs for anon/authenticated via view (requires select on table)
drop policy if exists push_rule_versions_public_select on public.push_rule_versions;
create policy push_rule_versions_public_select on public.push_rule_versions
  for select to anon, authenticated
  using (published_at is not null);

commit;
