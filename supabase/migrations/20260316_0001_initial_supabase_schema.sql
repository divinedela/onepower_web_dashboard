begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ------------------------------------------------------------
-- Enum types
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'publish_status') then
    create type public.publish_status as enum ('Publish', 'UnPublish');
  end if;

  if not exists (select 1 from pg_type where typname = 'campaign_lifecycle_status') then
    create type public.campaign_lifecycle_status as enum ('Upcoming', 'Running', 'Ended');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_recipient') then
    create type public.notification_recipient as enum ('User', 'Admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'donation_payment_status') then
    create type public.donation_payment_status as enum ('Pending', 'Successful', 'Failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_mode') then
    create type public.payment_mode as enum ('testMode', 'liveMode');
  end if;
end
$$;

-- ------------------------------------------------------------
-- Shared updated_at trigger
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Core auth/profile tables
-- ------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  legacy_mongo_id text unique,
  image text,
  firstname text not null,
  lastname text not null,
  email citext not null unique,
  country_code text not null,
  phone_number text not null,
  password_hash text,
  is_verified boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_logins (
  id uuid primary key default gen_random_uuid(),
  legacy_mongo_id text unique,
  name text not null,
  email citext not null unique,
  password_hash text not null,
  contact text not null,
  avatar text not null,
  is_admin smallint not null default 0 check (is_admin in (0, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Content tables
-- ------------------------------------------------------------
create table if not exists public.intros (
  id uuid primary key default gen_random_uuid(),
  legacy_mongo_id text unique,
  image text not null,
  title text not null,
  description text not null,
  status public.publish_status not null default 'Publish',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  legacy_mongo_id text unique,
  image text not null,
  name text not null,
  status public.publish_status not null default 'Publish',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  legacy_mongo_id text unique,
  image text not null,
  name text not null,
  category_id uuid not null references public.categories(id) on delete restrict,
  starting_date date not null,
  ending_date date not null,
  campaign_amount numeric(14,2) not null default 0,
  organizer_image text not null,
  organizer_name text not null,
  gallery text[] not null default '{}',
  description text not null,
  campaign_status public.campaign_lifecycle_status not null default 'Upcoming',
  status public.publish_status not null default 'Publish',
  is_user boolean not null default false,
  user_id uuid references public.users(id) on delete set null,
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_dates_check check (ending_date >= starting_date)
);

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  legacy_mongo_id text unique,
  image text not null,
  title text not null,
  description text not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  status public.publish_status not null default 'Publish',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  legacy_mongo_id text unique,
  image text not null,
  title text not null,
  news_id uuid not null references public.news(id) on delete cascade,
  status public.publish_status not null default 'Publish',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique,
  private_policy text,
  terms_and_condition text,
  about_us text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.currency_timezones (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique,
  currency text not null,
  timezone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Donation/payment tables
-- ------------------------------------------------------------
create table if not exists public.payment_gateways (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique default 'paystack',
  is_enabled boolean not null default true,
  mode public.payment_mode not null default 'testMode',
  public_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  legacy_mongo_id text unique,
  date date not null default current_date,
  user_id uuid not null references public.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null default 'GHS',
  payment_method text not null default 'Paystack',
  transaction_id text not null unique,
  payment_status public.donation_payment_status not null default 'Pending',
  authorization_url text not null default '',
  failure_reason text not null default '',
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- User activity tables
-- ------------------------------------------------------------
create table if not exists public.favourite_campaigns (
  id uuid primary key default gen_random_uuid(),
  legacy_mongo_id text unique,
  user_id uuid not null references public.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, campaign_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  legacy_mongo_id text unique,
  recipient public.notification_recipient not null,
  recipient_user_id uuid references public.users(id) on delete set null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_notification_devices (
  id uuid primary key default gen_random_uuid(),
  legacy_mongo_id text unique,
  user_id uuid not null references public.users(id) on delete cascade,
  registration_token text not null,
  device_id text not null,
  platform text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id)
);

-- ------------------------------------------------------------
-- OTP + admin config tables
-- ------------------------------------------------------------
create table if not exists public.otps (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  otp integer not null check (otp >= 1000 and otp <= 999999),
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forgot_password_otps (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  otp integer not null check (otp >= 1000 and otp <= 999999),
  is_verified boolean not null default false,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.verification_licenses (
  id uuid primary key default gen_random_uuid(),
  legacy_mongo_id text unique,
  key text not null,
  base_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mail_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique,
  host text not null,
  port text not null,
  mail_username text not null,
  mail_password text not null,
  encryption text not null,
  sender_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Triggers
-- ------------------------------------------------------------
create or replace trigger trg_users_set_updated_at before update on public.users for each row execute function public.set_updated_at();
create or replace trigger trg_admin_logins_set_updated_at before update on public.admin_logins for each row execute function public.set_updated_at();
create or replace trigger trg_intros_set_updated_at before update on public.intros for each row execute function public.set_updated_at();
create or replace trigger trg_categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
create or replace trigger trg_campaigns_set_updated_at before update on public.campaigns for each row execute function public.set_updated_at();
create or replace trigger trg_news_set_updated_at before update on public.news for each row execute function public.set_updated_at();
create or replace trigger trg_banners_set_updated_at before update on public.banners for each row execute function public.set_updated_at();
create or replace trigger trg_pages_set_updated_at before update on public.pages for each row execute function public.set_updated_at();
create or replace trigger trg_currency_timezones_set_updated_at before update on public.currency_timezones for each row execute function public.set_updated_at();
create or replace trigger trg_payment_gateways_set_updated_at before update on public.payment_gateways for each row execute function public.set_updated_at();
create or replace trigger trg_donations_set_updated_at before update on public.donations for each row execute function public.set_updated_at();
create or replace trigger trg_favourite_campaigns_set_updated_at before update on public.favourite_campaigns for each row execute function public.set_updated_at();
create or replace trigger trg_notifications_set_updated_at before update on public.notifications for each row execute function public.set_updated_at();
create or replace trigger trg_user_notification_devices_set_updated_at before update on public.user_notification_devices for each row execute function public.set_updated_at();
create or replace trigger trg_otps_set_updated_at before update on public.otps for each row execute function public.set_updated_at();
create or replace trigger trg_forgot_password_otps_set_updated_at before update on public.forgot_password_otps for each row execute function public.set_updated_at();
create or replace trigger trg_verification_licenses_set_updated_at before update on public.verification_licenses for each row execute function public.set_updated_at();
create or replace trigger trg_mail_settings_set_updated_at before update on public.mail_settings for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Indexes (query patterns from current API/controllers)
-- ------------------------------------------------------------
create index if not exists idx_users_is_active on public.users(is_active);
create index if not exists idx_users_is_verified on public.users(is_verified);

create index if not exists idx_categories_status on public.categories(status);

create index if not exists idx_campaigns_category_id on public.campaigns(category_id);
create index if not exists idx_campaigns_user_id on public.campaigns(user_id);
create index if not exists idx_campaigns_status on public.campaigns(status);
create index if not exists idx_campaigns_campaign_status on public.campaigns(campaign_status);
create index if not exists idx_campaigns_is_approved on public.campaigns(is_approved);
create index if not exists idx_campaigns_is_user on public.campaigns(is_user);

create index if not exists idx_news_status on public.news(status);
create index if not exists idx_news_campaign_id on public.news(campaign_id);
create index if not exists idx_news_published_at on public.news(published_at desc);
create index if not exists idx_news_search on public.news using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '')));

create index if not exists idx_banners_news_id on public.banners(news_id);
create index if not exists idx_banners_status on public.banners(status);

create index if not exists idx_donations_user_id on public.donations(user_id);
create index if not exists idx_donations_campaign_id on public.donations(campaign_id);
create index if not exists idx_donations_payment_status on public.donations(payment_status);
create index if not exists idx_donations_created_at on public.donations(created_at desc);

create index if not exists idx_notifications_recipient on public.notifications(recipient);
create index if not exists idx_notifications_recipient_user_id on public.notifications(recipient_user_id);
create index if not exists idx_notifications_created_at on public.notifications(created_at desc);

create index if not exists idx_user_notification_devices_token on public.user_notification_devices(registration_token);

create index if not exists idx_otps_expires_at on public.otps(expires_at);
create index if not exists idx_forgot_password_otps_expires_at on public.forgot_password_otps(expires_at);

create index if not exists idx_verification_licenses_active on public.verification_licenses(is_active);

-- ------------------------------------------------------------
-- Campaign aggregation view (replacement for combineCampaignAndDonation)
-- ------------------------------------------------------------
create or replace view public.campaign_donation_stats as
select
  c.id as campaign_id,
  coalesce(sum(d.amount) filter (where d.payment_status = 'Successful'), 0)::numeric(14,2) as total_donation_amount,
  greatest(c.campaign_amount - coalesce(sum(d.amount) filter (where d.payment_status = 'Successful'), 0), 0)::numeric(14,2) as remaining_amount,
  count(d.id) filter (where d.payment_status = 'Successful')::int as total_donors
from public.campaigns c
left join public.donations d on d.campaign_id = c.id
group by c.id, c.campaign_amount;

-- ------------------------------------------------------------
-- RLS baseline
-- Keep service-role backend during migration; these policies enable direct client rollout.
-- ------------------------------------------------------------
alter table public.users enable row level security;
alter table public.campaigns enable row level security;
alter table public.favourite_campaigns enable row level security;
alter table public.donations enable row level security;
alter table public.notifications enable row level security;
alter table public.user_notification_devices enable row level security;
alter table public.categories enable row level security;
alter table public.news enable row level security;
alter table public.banners enable row level security;
alter table public.intros enable row level security;
alter table public.pages enable row level security;
alter table public.currency_timezones enable row level security;

drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users
for select to authenticated
using (auth.uid() = id);

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists campaigns_public_read on public.campaigns;
create policy campaigns_public_read on public.campaigns
for select to anon, authenticated
using (status = 'Publish');

drop policy if exists campaigns_user_insert on public.campaigns;
create policy campaigns_user_insert on public.campaigns
for insert to authenticated
with check (auth.uid() = user_id and is_user = true);

drop policy if exists campaigns_user_update on public.campaigns;
create policy campaigns_user_update on public.campaigns
for update to authenticated
using (auth.uid() = user_id and is_user = true)
with check (auth.uid() = user_id and is_user = true);

drop policy if exists campaigns_user_delete on public.campaigns;
create policy campaigns_user_delete on public.campaigns
for delete to authenticated
using (auth.uid() = user_id and is_user = true);

drop policy if exists favourites_select_own on public.favourite_campaigns;
create policy favourites_select_own on public.favourite_campaigns
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists favourites_insert_own on public.favourite_campaigns;
create policy favourites_insert_own on public.favourite_campaigns
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists favourites_delete_own on public.favourite_campaigns;
create policy favourites_delete_own on public.favourite_campaigns
for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists donations_select_own on public.donations;
create policy donations_select_own on public.donations
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists donations_insert_own on public.donations;
create policy donations_insert_own on public.donations
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists notifications_select_user on public.notifications;
create policy notifications_select_user on public.notifications
for select to authenticated
using (recipient = 'User' and recipient_user_id = auth.uid());

drop policy if exists notifications_update_user on public.notifications;
create policy notifications_update_user on public.notifications
for update to authenticated
using (recipient = 'User' and recipient_user_id = auth.uid())
with check (recipient = 'User' and recipient_user_id = auth.uid());

drop policy if exists devices_select_own on public.user_notification_devices;
create policy devices_select_own on public.user_notification_devices
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists devices_insert_own on public.user_notification_devices;
create policy devices_insert_own on public.user_notification_devices
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists devices_update_own on public.user_notification_devices;
create policy devices_update_own on public.user_notification_devices
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists devices_delete_own on public.user_notification_devices;
create policy devices_delete_own on public.user_notification_devices
for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
for select to anon, authenticated
using (status = 'Publish');

drop policy if exists news_public_read on public.news;
create policy news_public_read on public.news
for select to anon, authenticated
using (status = 'Publish');

drop policy if exists banners_public_read on public.banners;
create policy banners_public_read on public.banners
for select to anon, authenticated
using (status = 'Publish');

drop policy if exists intros_public_read on public.intros;
create policy intros_public_read on public.intros
for select to anon, authenticated
using (status = 'Publish');

drop policy if exists pages_public_read on public.pages;
create policy pages_public_read on public.pages
for select to anon, authenticated
using (true);

drop policy if exists currency_public_read on public.currency_timezones;
create policy currency_public_read on public.currency_timezones
for select to anon, authenticated
using (true);

commit;
